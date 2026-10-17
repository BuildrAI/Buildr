#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { assertMinimumNodeVersion, spawnCommandSync } from '../../src/infrastructure/process.ts';
import { prepareCandidateEnvironment } from '../../tools/verification/candidate-environment.ts';
import { CANDIDATE_CI_HOST_NODE_TUPLES, CANDIDATE_CI_SHARDS } from './registry.ts';
import { readCandidateCiArtifact, resolveCandidateExecutionContext, resolveCandidateSourceCommit } from './candidate-ci-evidence.ts';
import { createCandidateCheckInputReader } from '../../../../../../skills/buildr-release/scripts/candidate-source-binding.ts';
import { candidateProofDefinition, candidateProofDescriptors } from './candidate-repair.ts';
import { assertFrozenCandidateCheckout, createCandidateExecutionEnvironment, sameCandidateExecutionEnvironment, validateCandidateArtifactEvidence } from './candidate-artifact-reuse.ts';

const productRoot = path.resolve(import.meta.dirname, '../..');
const entry = path.join(productRoot, 'test/verification/candidate-ci.ts');

export function parseArtifactArgs(args: string[]): any {
  const options: any = { scope: 'all', nodeTuple: 'current', json: false, help: false };
  const values: Record<string, string> = { '--scope': 'scope', '--node-tuple': 'nodeTuple', '--artifact-dir': 'artifactDirectory', '--output': 'output' };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (seen.has(arg)) throw new Error(`Repeated option: ${arg}`);
    seen.add(arg);
    if (arg === '--json') options.json = true;
    else if (arg === '--help') options.help = true;
    else if (values[arg]) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[values[arg]!] = value;
    } else throw new Error(`Unknown artifact option: ${arg}`);
  }
  if (!['all', 'common', 'platform'].includes(options.scope)) throw new Error('--scope must be all, common or platform.');
  if (!['minimum', 'current'].includes(options.nodeTuple)) throw new Error('--node-tuple must be minimum or current.');
  if (options.help && args.length !== 1) throw new Error('--help cannot be combined with other arguments.');
  if (!options.help && (!options.artifactDirectory || !options.output)) throw new Error('Explicit --artifact-dir and --output are required; this entry never produces a package.');
  return options;
}

export function createLocalArtifactPlan(platform = process.platform, options: any = {}): any {
  const runner = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : platform;
  if (!['macos', 'windows'].includes(runner)) throw new Error(`No package platform checks are declared for ${runner}.`);
  const scope = options.scope ?? 'all';
  const nodeTuple = options.nodeTuple ?? 'current';
  if (!['all', 'common', 'platform'].includes(scope) || !['current', 'minimum'].includes(nodeTuple)) throw new Error('Invalid local package selection.');
  if (nodeTuple === 'minimum' && scope !== 'platform') throw new Error('--node-tuple minimum requires --scope platform; common package checks run once.');
  const shards = nodeTuple === 'minimum' ? [] : CANDIDATE_CI_SHARDS.filter((shard: any) => shard.requiresArtifact && (
    shard.platformScope.kind === 'common' ? scope !== 'platform' : scope !== 'common' && shard.platformScope.runners.includes(runner)
  ));
  const hosts = scope === 'common' ? [] : CANDIDATE_CI_HOST_NODE_TUPLES.filter((tuple: any) => tuple.runner === runner && tuple.expectation === nodeTuple);
  return { schemaVersion: 'buildr.local-artifact-plan/v1', runner, scope, nodeTuple,
    nodes: [...shards.map((shard: any) => ({ id: shard.id, action: 'run', preparation: shard.preparation, stepIds: shard.stepIds })),
      ...hosts.map((tuple: any) => ({ id: tuple.id, action: 'host', preparation: tuple.id === 'host-minimum-macos' ? 'publisher' : 'host', stepIds: ['host-node-compatibility'] }))] };
}

export function runLocalArtifactVerification(options: any, dependencies: any = {}): any {
  const plan = createLocalArtifactPlan(dependencies.platform ?? process.platform, options);
  const nodeVersion = dependencies.nodeVersion ?? process.versions.node;
  if (plan.scope !== 'common' && plan.nodeTuple === 'minimum' && nodeVersion !== '24.15.0') throw new Error(`Minimum Node package checks require actual Node 24.15.0, active ${nodeVersion}.`);
  assertMinimumNodeVersion(nodeVersion, '24.15.0');
  if (plan.scope !== 'common' && plan.nodeTuple === 'current' && !/^24\.\d+\.\d+$/u.test(nodeVersion)) throw new Error(`The current package compatibility tuple requests stable Node 24.x, active ${nodeVersion}; select that actual Node before executing any checks.`);
  const artifactDirectory = path.resolve(options.artifactDirectory);
  const output = path.resolve(options.output);
  // An explicit source is checked by every execution owner against this same
  // immutable manifest. Reading bytes here can never fall back to npm pack.
  const expectedSource = process.env.BUILDR_CANDIDATE_PRODUCT_SOURCE || process.env.BUILDR_CANDIDATE_SOURCE_SHA || resolveCandidateSourceCommit(productRoot);
  const artifact = (dependencies.readArtifact ?? readCandidateCiArtifact)(artifactDirectory, expectedSource);
  if (options.json) return { ...plan, artifact: artifact.identity, artifactDirectory, output };
  const assertCheckout = dependencies.assertCheckout ?? assertFrozenCandidateCheckout;
  const verificationSource = resolveCandidateSourceCommit(productRoot, process.env.BUILDR_CANDIDATE_SOURCE_SHA || null);
  assertCheckout(productRoot, verificationSource);
  fs.mkdirSync(output, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, BUILDR_VERIFICATION_PROFILE: 'ci-workspace-limited', BUILDR_CANDIDATE_CI_ARTIFACT_DIR: artifactDirectory, BUILDR_CANDIDATE_CI_OUTPUT_DIR: output };
  // A local process retains its local identity; it never impersonates an
  // Actions job just because it will later contribute to a hosted aggregate.
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_JOB', 'GITHUB_EVENT_NAME', 'BUILDR_CANDIDATE_CI_EVIDENCE_OUTPUT']) delete env[key];
  const prepared = new Set<string>();
  const results: any[] = [];
  for (const node of plan.nodes) {
    const evidenceFile = path.join(output, `candidate-ci-evidence-${node.id}.json`);
    let reusable = false;
    if (fs.existsSync(evidenceFile)) {
      try {
        const previous = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
        const source = resolveCandidateSourceCommit(productRoot, env.BUILDR_CANDIDATE_SOURCE_SHA || null);
        const context = resolveCandidateExecutionContext(productRoot, source, env);
        const descriptor = candidateProofDescriptors().find(item => item.id === node.id);
        const readInput = createCandidateCheckInputReader(productRoot);
        const inputs = Object.fromEntries(descriptor.steps.map((step: any) => [step.id, readInput(source, candidateProofDefinition(step))]));
        reusable = validateCandidateArtifactEvidence(previous, descriptor, context, inputs, artifact.identity)
          && sameCandidateExecutionEnvironment(previous.executionEnvironment, createCandidateExecutionEnvironment(productRoot, inputs, env, { preparation: node.preparation }));
      } catch { /* An unreadable or stale result is a miss, never success. */ }
    }
    if (reusable) { results.push({ id: node.id, status: 'passed', disposition: 'reused' }); continue; }
    if (!prepared.has(node.preparation)) {
      (dependencies.prepare ?? prepareCandidateEnvironment)({ profile: node.preparation, env, reusePrepared: true,
        output: path.join(output, `${node.preparation}-preparation.json`) });
      prepared.add(node.preparation);
    }
    const result = (dependencies.execute ?? spawnCommandSync)(process.execPath, [entry, node.action, node.id], {
      cwd: productRoot, encoding: 'utf8', env: { ...env, BUILDR_CANDIDATE_CI_EVIDENCE_OUTPUT: evidenceFile },
      timeout: 600_000,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    results.push({ id: node.id, status: result.status === 0 && !result.error ? 'passed' : 'failed', disposition: 'executed' });
    if (results.at(-1)!.status !== 'passed') break;
  }
  assertCheckout(productRoot, verificationSource);
  return { ...plan, artifact: artifact.identity, output, status: results.length === plan.nodes.length && results.every(result => result.status === 'passed') ? 'passed' : 'failed', results };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const options = parseArtifactArgs(process.argv.slice(2));
    if (options.help) process.stdout.write('Usage: artifact.ts --artifact-dir <original-package-directory> --output <evidence-directory> [--scope all|common|platform] [--node-tuple current|minimum] [--json]\n');
    else {
      const result = runLocalArtifactVerification(options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.status === 'failed') process.exitCode = 1;
    }
  } catch (error: any) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
