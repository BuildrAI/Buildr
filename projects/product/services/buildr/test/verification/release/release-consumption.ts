#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { assertReleaseExecutionCheckout } from '../../../../../../../skills/buildr-release/scripts/candidate-source-binding.ts';
import { spawnCommandSync } from '../../../src/infrastructure/process.ts';
import { readReleaseArtifact, assertNpmTarballInventory } from '../../../../../../../skills/buildr-release/scripts/release-artifact.ts';
import { resolveReleaseContract } from '../../../../../../../skills/buildr-release/scripts/release-contract.ts';
import { extractReleaseNotes } from '../../../../../../../skills/buildr-release/scripts/release-notes.ts';
import { publisherNpmCli } from '../../../tools/verification/candidate-environment.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../../..');
const repositoryRoot = path.resolve(serviceRoot, '../../../..');

// Keep the historical entry compatible; consumers can import the contract without loading package execution.
export { RELEASE_CHECKS, RELEASE_CONSUMER_COMMANDS, releaseConsumptionIdentity, validateReleaseCheckDefinitions, assertReleaseConsumptionCoverage, type ReleaseInitialCheckId, type ReleaseEffectCheckId } from './release-consumption-contract.ts';
import { RELEASE_CHECKS, RELEASE_CONSUMER_COMMANDS, releaseConsumptionIdentity, validateReleaseCheckDefinitions, assertReleaseConsumptionCoverage } from './release-consumption-contract.ts';

export function validateArtifactDocumentLinks(tarball: string, inventory: any, execute = spawnCommandSync): { checked: number } {
  const files = new Set<string>(inventory.files.map((entry: any) => entry.path));
  let checked = 0;
  for (const file of ['README.md', 'payload/product/README.md']) {
    if (!files.has(file)) throw new Error(`Package documentation is missing ${file}.`);
    const result = execute('tar', ['-xOf', tarball, `package/${file}`], { encoding: 'utf8', timeout: 30_000 });
    if (result.error || result.status !== 0) throw new Error(`Unable to read package documentation ${file}.`);
    for (const match of String(result.stdout).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu)) {
      const target = match[1]!;
      if (/^(?:https?:|mailto:|#)/u.test(target)) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target.split('#')[0]!));
      if (!files.has(resolved)) throw new Error(`Package documentation link is missing: ${file} -> ${target}`);
      checked++;
    }
  }
  return { checked };
}

export function inspectReleaseConsumerArtifact(manifestPath: string, roots = { serviceRoot, repositoryRoot }): any {
  const artifact = readReleaseArtifact(manifestPath);
  const metadata = JSON.parse(fs.readFileSync(path.join(roots.serviceRoot, 'package.json'), 'utf8'));
  if (metadata.name !== artifact.manifest.packageName || metadata.version !== artifact.manifest.version) throw new Error('Release consumer source package identity differs from the frozen artifact.');
  const notes = extractReleaseNotes(fs.readFileSync(path.join(roots.repositoryRoot, 'CHANGELOG.md'), 'utf8'), metadata.version);
  const contract = resolveReleaseContract(metadata.version, `v${metadata.version}`, { sourceCommit: artifact.manifest.sourceCommit, enginesNode: metadata.engines.node, releaseNotes: notes });
  const packs = JSON.parse(fs.readFileSync(path.join(path.dirname(artifact.manifestPath), 'npm-pack.json'), 'utf8'));
  if (!Array.isArray(packs) || packs.length !== 1 || packs[0].filename !== artifact.manifest.filename || packs[0].integrity !== artifact.manifest.integrity) throw new Error('Release consumer requires matching single-package inventory.');
  assertNpmTarballInventory(packs[0].files);
  const documents = validateArtifactDocumentLinks(artifact.tarball, packs[0]);
  return { artifact, contract, documents };
}

export function runReleaseConsumer(operation: 'platform' | 'host' | 'registry' | 'metadata' | 'publisher' | 'browser-core', options: { manifestPath?: string; packageSpec?: string; env?: NodeJS.ProcessEnv; execute?: typeof spawnCommandSync } = {}): any {
  const execute = options.execute ?? spawnCommandSync;
  const env = { ...process.env, ...options.env };
  let inspected: any = null;
  if (operation !== 'registry') {
    const manifestPath = options.manifestPath || env.BUILDR_RELEASE_ARTIFACT_MANIFEST || env.BUILDR_CANDIDATE_RELEASE_MANIFEST;
    if (!manifestPath) throw new Error('Release consumption requires an explicit frozen artifact; it never builds a package.');
    inspected = inspectReleaseConsumerArtifact(manifestPath);
    env.BUILDR_CANDIDATE_TARBALL = inspected.artifact.tarball;
    env.BUILDR_CANDIDATE_PACK_METADATA = path.join(path.dirname(manifestPath), 'npm-pack.json');
    env.BUILDR_CANDIDATE_RELEASE_MANIFEST = manifestPath;
    delete env.BUILDR_RELEASE_ARTIFACT_MANIFEST;
    delete env.BUILDR_RELEASE_PACKAGE_SPEC;
  } else {
    const packageSpec = options.packageSpec || env.BUILDR_RELEASE_PACKAGE_SPEC;
    if (!/^@buildr-ai\/buildr@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(packageSpec || '')) throw new Error('Registry consumption requires an exact official package version.');
    env.BUILDR_RELEASE_PACKAGE_SPEC = packageSpec;
    for (const key of ['BUILDR_CANDIDATE_TARBALL', 'BUILDR_CANDIDATE_PACK_METADATA', 'BUILDR_CANDIDATE_RELEASE_MANIFEST', 'BUILDR_RELEASE_ARTIFACT_MANIFEST']) delete env[key];
  }
  const startedAt = Date.now();
  if (operation !== 'metadata') {
    const command = operation === 'publisher'
      ? { file: path.relative(serviceRoot, publisherNpmCli()), args: ['publish', inspected.artifact.tarball, '--dry-run', '--ignore-scripts', '--provenance=false', '--access', 'public', '--tag', inspected.contract.npmTag, '--registry=https://registry.npmjs.org/'] }
      : RELEASE_CONSUMER_COMMANDS[operation];
    const result = execute(process.execPath, [path.join(serviceRoot, command.file), ...command.args], { cwd: serviceRoot, env, encoding: 'utf8', timeout: 300_000 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error || result.status !== 0) throw Object.assign(new Error(`Release consumer ${operation} failed: ${result.error?.message || result.signal || result.status}`), { code: 'release-consumer-failed', durationMs: Date.now() - startedAt, signal: result.signal, pid: result.pid });
  }
  return { status: 'passed', operation, consumptionIdentity: releaseConsumptionIdentity(), artifact: inspected?.artifact.manifest ?? null, durationMs: Date.now() - startedAt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const action = process.argv[2];
    if (action === 'plan') process.stdout.write(`${JSON.stringify({ identity: releaseConsumptionIdentity(), checks: RELEASE_CHECKS, commands: RELEASE_CONSUMER_COMMANDS })}\n`);
    else if (action === 'verify') {
      const [contextFile, aggregateFile, manifestFile] = process.argv.slice(3);
      if (!contextFile || !aggregateFile || !manifestFile) throw new Error('verify requires context, aggregate and manifest files.');
      const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
      const aggregate = JSON.parse(fs.readFileSync(aggregateFile, 'utf8'));
      if (!isDeepStrictEqual(context.verification ?? null, aggregate.sourceBinding ?? null)) throw new Error('Release executor proof differs from the frozen Candidate.');
      if (context.verification) assertReleaseExecutionCheckout(repositoryRoot, context);
      const artifact = inspectReleaseConsumerArtifact(manifestFile).artifact.manifest;
      assertReleaseConsumptionCoverage(aggregate, context.release, artifact, context);
      for (const field of ['sourceCommit', 'filename', 'size', 'sha256', 'integrity', 'applicationPayloadDigest']) if (artifact[field] !== context.artifact?.[field]) throw new Error(`Frozen release context artifact ${field} mismatches.`);
      const { releaseContextIdentity } = await import('../../../../../../../skills/buildr-release/scripts/release-readiness.ts');
      if (releaseContextIdentity(aggregate) !== context.candidate.aggregateIdentity) throw new Error('Frozen Candidate aggregate identity mismatches.');
      process.stdout.write('Release consumption coverage and immutable bytes passed.\n');
    } else if (['platform', 'host', 'registry', 'metadata', 'publisher', 'browser-core'].includes(action || '')) {
      const result = runReleaseConsumer(action as 'platform' | 'host' | 'registry' | 'metadata' | 'publisher' | 'browser-core');
      // The immutable manifest retains inventory; normal logs need only its identity.
      const artifact = result.artifact && Object.fromEntries(['version', 'filename', 'sha256', 'integrity', 'sourceCommit'].map(key => [key, result.artifact[key]]));
      process.stdout.write(`${JSON.stringify({ ...result, ...(artifact ? { artifact } : {}) })}\n`);
    }
    else throw new Error('Usage: release-consumption.ts <plan|metadata|platform|host|publisher|registry|browser-core|verify>');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
