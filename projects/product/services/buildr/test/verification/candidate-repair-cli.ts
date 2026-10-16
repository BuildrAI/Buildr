#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCandidateRepairPlan, reusedCandidateProofResult } from './candidate-repair.ts';
import { candidateCiRegistryIdentity, createCandidateCiEvidence, readCandidateCiArtifact, readCandidateCiEvidenceFiles, writeCandidateCiEvidence } from './candidate-ci-evidence.ts';
import { CANDIDATE_CI_SHARDS, CANDIDATE_CI_HOST_NODE_TUPLES } from './registry.ts';
import { createCandidateSourceBinding } from '../../tools/release/candidate-source-binding.ts';
import { validateCandidateRepairRun } from './candidate-repair.ts';
import { assertPluginSourceAggregate, createPluginSourceAggregate } from '../../tools/release/verify-pr-candidate.ts';
import { readReleaseCandidate } from '../../../dsh-plugin/tools/release-candidate.ts';
import { readArtifactInput } from '../../../dsh-plugin/tools/buildr-peer.ts';

export function prepareCandidateRepair(options: { repo: string; output: string; runId: string; productSource: string; verificationSource: string; repository: string }, dependencies: any = {}): any {
  if (!/^[1-9]\d*$/u.test(options.runId) || options.repository !== 'BuildrAI/Buildr') throw new Error('Candidate repair requires one original Buildr controlled run.');
  const call = dependencies.call ?? ((args: string[]) => execFileSync('gh', args, { cwd: options.repo, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  const run = JSON.parse(call(['api', 'repos/' + options.repository + '/actions/runs/' + options.runId]));
  const originalRun = { id: run.id, repository: { full_name: run.repository?.full_name }, path: run.path, event: run.event,
    status: run.status, conclusion: run.conclusion, head_sha: run.head_sha, head_branch: run.head_branch, run_attempt: run.run_attempt };
  const packageRoot = path.join(options.output, 'candidate-package'), evidenceRoot = path.join(options.output, 'original-evidence');
  fs.mkdirSync(options.output, { recursive: true });
  call(['run', 'download', options.runId, '--repo', options.repository, '--name', 'candidate-package', '--dir', packageRoot]);
  call(['run', 'download', options.runId, '--repo', options.repository, '--pattern', 'candidate-evidence-*', '--dir', evidenceRoot]);
  const artifact = readCandidateCiArtifact(packageRoot, options.productSource);
  const registryIdentity = candidateCiRegistryIdentity();
  const plan = createCandidateRepairPlan({ repo: options.repo, repository: options.repository, originalRun, artifact: artifact.identity,
    verificationSource: options.verificationSource, evidence: readCandidateCiEvidenceFiles(evidenceRoot), registryIdentity });
  const serialized = JSON.stringify(plan);
  if (Buffer.byteLength(serialized) > 8 * 1024 * 1024) throw new Error('Candidate repair plan exceeds its evidence budget; no checks were dispatched.');
  fs.writeFileSync(path.join(options.output, 'candidate-repair-plan.json'), serialized + '\n');
  return { plan, artifact };
}

export function materializeCandidateRepair(plan: any, directory: string, workflow: any): any {
  const platforms: Record<string, string> = { macos: 'macos-15', windows: 'windows-2025' };
  const selected = (id: string) => plan.checks.find((check: any) => check.id === id);
  const needsExecution = (id: string) => selected(id).steps.some((step: any) => step.disposition === 'execute');
  const matrices = {
    source: CANDIDATE_CI_SHARDS.filter((shard: any) => !shard.requiresArtifact && !shard.producesArtifact && needsExecution(shard.id))
      .map((shard: any) => ({ shard: shard.id, os: platforms[shard.runner], preparation: shard.preparation })),
    artifact: CANDIDATE_CI_SHARDS.filter((shard: any) => shard.requiresArtifact && needsExecution(shard.id))
      .map((shard: any) => ({ shard: shard.id, os: platforms[shard.runner], preparation: shard.preparation })),
    host: CANDIDATE_CI_HOST_NODE_TUPLES.filter((tuple: any) => needsExecution(tuple.id))
      .map((tuple: any) => ({ id: tuple.id, os: platforms[tuple.runner], node: tuple.requestedNode, preparation: tuple.id === 'host-minimum-macos' ? 'publisher' : 'host' })),
  };
  for (const check of plan.checks.filter((item: any) => !needsExecution(item.id))) {
    const original = check.original, now = new Date().toISOString(), binding = plan.sourceBinding;
    const evidence = createCandidateCiEvidence({ kind: check.kind, id: check.id, purpose: 'candidate',
      sourceCommit: binding.productSource, sourceTree: binding.productTree, verificationSource: binding.verificationSource, sourceBinding: binding,
      registryIdentity: plan.registryIdentity, workflow, platform: original.runner.platform, arch: original.runner.arch,
      nodeVersion: original.runner.nodeVersion, requestedNode: check.requestedNode,
      primaryStepIds: check.kind === 'shard' ? check.steps.map((step: any) => step.id) : [],
      artifact: check.requiresArtifact ? plan.artifact : null, startedAt: now, finishedAt: now, durationMs: 0,
      status: 'passed', cleanupClean: true,
      checkInputs: Object.fromEntries(check.steps.map((step: any) => [step.id, step.inputIdentity])),
      results: check.steps.map((step: any) => reusedCandidateProofResult(step.proof)) });
    writeCandidateCiEvidence(path.join(directory, 'candidate-ci-evidence-' + check.id + '.json'), evidence);
  }
  return matrices;
}

export function preservePluginSourceCandidate(options: { repo: string; temporaryRoot: string; runId: string; verificationSource: string; workflow: any }, dependencies: any = {}): any {
  const plan = JSON.parse(fs.readFileSync(path.join(options.temporaryRoot, 'release-candidate-plan.json'), 'utf8'));
  const binding = createCandidateSourceBinding(options.repo, plan.sourceCommit, options.verificationSource);
  const call = dependencies.call ?? ((args: string[]) => execFileSync('gh', args, { cwd: options.repo, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  const run = JSON.parse(call(['api', 'repos/BuildrAI/Buildr/actions/runs/' + options.runId]));
  validateCandidateRepairRun(run, 'BuildrAI/Buildr', options.runId);
  if (run.head_sha !== binding.productSource) throw new Error('Original plugin run differs from the preserved product source.');
  const candidateRoot = path.join(options.repo, 'projects/product/services/dsh-plugin/build/release-candidates', plan.pluginVersion);
  const previousRoot = path.join(options.temporaryRoot, 'plugin-original-aggregate');
  call(['run', 'download', options.runId, '--repo', 'BuildrAI/Buildr', '--name', 'plugin-candidate-v' + plan.pluginVersion, '--dir', candidateRoot]);
  call(['run', 'download', options.runId, '--repo', 'BuildrAI/Buildr', '--name', 'plugin-candidate-aggregate', '--dir', previousRoot]);
  const previous = JSON.parse(fs.readFileSync(path.join(previousRoot, 'plugin-candidate-ci-aggregate.json'), 'utf8'));
  const candidate = readReleaseCandidate(path.join(candidateRoot, 'candidate.json'), {
    version: plan.pluginVersion, sourceCommit: binding.productSource, sourceTree: plan.serviceTree, sourceSdk: plan.sourceSdk });
  plan.expectedPeer = readArtifactInput(path.join(options.temporaryRoot, 'plugin-buildr-peer.json')).artifact;
  assertPluginSourceAggregate(previous, plan, run.id, run.run_attempt);
  if (previous.candidate.sha256 !== candidate.manifest.sha256 || previous.candidate.integrity !== candidate.manifest.integrity) throw new Error('Preserved plugin proof refers to different bytes.');
  const aggregate = createPluginSourceAggregate(plan, candidate.manifest, previous.verification, options.workflow);
  aggregate.sourceBinding = binding;
  aggregate.reusedFrom = previous.reusedFrom ?? { workflow: previous.workflow, sourceCommit: previous.sourceCommit };
  aggregate.checks = aggregate.checks.map((check: any) => ({ ...check, disposition: 'reused', origin: aggregate.reusedFrom }));
  fs.writeFileSync(path.join(options.temporaryRoot, 'plugin-candidate-ci-aggregate.json'), JSON.stringify(aggregate) + '\n');
  return { status: 'passed', sourceBinding: binding, reusedFrom: aggregate.reusedFrom, candidate: candidate.manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!['plan', 'plugin'].includes(process.argv[2] ?? '') || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('Candidate repair uses the controlled manual entry.');
    const repo = path.resolve(import.meta.dirname, '../../../../../..'), output = path.resolve(process.env.BUILDR_CANDIDATE_REPAIR_DIR || '');
    if (process.argv[2] === 'plan' && !process.env.BUILDR_CANDIDATE_REPAIR_DIR) throw new Error('Candidate repair output directory is required.');
    const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const verificationSource = git(['rev-parse', 'HEAD']);
    if (verificationSource !== process.env.CANDIDATE_SOURCE_SHA || git(['status', '--porcelain', '--untracked-files=all'])) throw new Error('Candidate repair requires the exact clean verification checkout.');
    if (process.env.BUILDR_CANDIDATE_PRODUCT_SOURCE !== process.env.GITHUB_SHA) throw new Error('Candidate repair must retain the original workflow source.');
    git(['merge-base', '--is-ancestor', verificationSource, 'origin/dev']);
    if (process.argv[2] === 'plugin') {
      const result = preservePluginSourceCandidate({ repo, temporaryRoot: process.env.RUNNER_TEMP!, runId: process.env.BUILDR_CANDIDATE_REPAIR_RUN_ID || '', verificationSource,
        workflow: { runId: process.env.GITHUB_RUN_ID, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) } });
      process.stdout.write(JSON.stringify(result) + '\n');
    } else {
    const { plan } = prepareCandidateRepair({ repo, output, runId: process.env.BUILDR_CANDIDATE_REPAIR_RUN_ID || '',
      productSource: process.env.BUILDR_CANDIDATE_PRODUCT_SOURCE || '', verificationSource, repository: process.env.GITHUB_REPOSITORY || '' });
    const matrices = materializeCandidateRepair(plan, path.join(output, 'reused-evidence'), {
      runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, job: process.env.GITHUB_JOB });
    if (process.env.GITHUB_OUTPUT) {
      for (const [key, include] of Object.entries(matrices)) fs.appendFileSync(process.env.GITHUB_OUTPUT, key + '=' + JSON.stringify({ include }) + '\n' + key + '_required=' + (include.length > 0) + '\n');
    }
    process.stdout.write(JSON.stringify({ sourceBinding: plan.sourceBinding, matrices, checks: plan.checks.map((check: any) => ({ id: check.id,
      steps: check.steps.map(({ proof, ...step }: any) => step) })) }, null, 2) + '\n');
    }
  } catch (error: any) { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; }
}
