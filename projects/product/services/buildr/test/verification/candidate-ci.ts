#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { assertMinimumNodeVersion, createExactNodeExecutionEnvironment, spawnCommandSync } from '../../src/infrastructure/process.ts';
import { enforceOfflineVerification } from '../../src/infrastructure/network/verification-network-policy.ts';
import { executePlan } from './plan-runner.ts';
import { createCandidateCiShardPlan } from './planner.ts';
import { candidateSourceImportFromEnvironment, planCandidateSourceReuse } from './candidate-source-reuse.ts';
import { collectVerificationReuseSnapshot, validateVerificationReuseRecord } from './verification-reuse.ts';
import { CANDIDATE_CI_HOST_NODE_TUPLES, CANDIDATE_CI_SHARDS, resolveVerificationExecutionProfile } from './registry.ts';
import { createCandidateCheckInputReader } from '../../tools/release/candidate-source-binding.ts';
import { assertCandidateRepairPlan, candidateProofDefinition, candidateProofDescriptors, candidateRepairShardPlan, reusedCandidateProofResult, validateCandidateRepairProof } from './candidate-repair.ts';
import {
  aggregateCandidateCiEvidence,
  candidateCiRegistryIdentity,
  createCandidateCiCheckpoint,
  createCandidateCiEvidence,
  readCandidateCiArtifact,
  readCandidateCiEvidenceFiles,
  resolveCandidateExecutionContext,
  resolveCandidateSourceCommit,
  writeCandidateCiEvidence,
  writeCandidateCiCheckpoint,
} from './candidate-ci-evidence.ts';
import {
  CANDIDATE_PACK_METADATA_ENV,
  CANDIDATE_RELEASE_MANIFEST_ENV,
  CANDIDATE_TARBALL_ENV,
} from './release/candidate-package.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot: any = path.resolve(productRoot, '../..');
const action: any = process.argv[2];
const id: any = process.argv[3];
const outputRoot: any = path.resolve(process.env.BUILDR_CANDIDATE_CI_OUTPUT_DIR || path.join(os.tmpdir(), 'buildr-candidate-ci'));
const evidencePath: any = (evidenceId: any) => path.resolve(process.env.BUILDR_CANDIDATE_CI_EVIDENCE_OUTPUT || path.join(outputRoot, `candidate-ci-evidence-${evidenceId}.json`));
const checkpointPath: any = (evidenceId: any) => path.join(path.dirname(evidencePath(evidenceId)), `candidate-ci-checkpoint-${evidenceId}.json`);
const expectedSource: any = process.env.BUILDR_CANDIDATE_SOURCE_SHA || null;
const workflowIdentity: any = process.env.GITHUB_RUN_ID ? {
  runId: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  job: process.env.GITHUB_JOB ?? null,
} : null;

function repairPlan(): any {
  const filename = process.env.BUILDR_CANDIDATE_REPAIR_PLAN || (process.env.BUILDR_CANDIDATE_REPAIR_RUN_ID && process.env.RUNNER_TEMP
    ? path.join(process.env.RUNNER_TEMP, 'candidate-repair-plan', 'candidate-repair-plan.json') : null);
  if (!filename) return null;
  if (!process.env.BUILDR_CANDIDATE_PRODUCT_SOURCE || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('Candidate repair requires its controlled original product source.');
  const plan = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assertCandidateRepairPlan(plan, productRoot, candidateCiRegistryIdentity());
  if (plan.sourceBinding.verificationSource !== resolveCandidateSourceCommit(productRoot, expectedSource)
    || plan.sourceBinding.productSource !== process.env.BUILDR_CANDIDATE_PRODUCT_SOURCE) throw new Error('Candidate repair plan differs from the execution source.');
  return plan;
}

function checkInputsFor(id: string, commit: string): any {
  const descriptor = candidateProofDescriptors().find(item => item.id === id);
  const input = createCandidateCheckInputReader(productRoot);
  return Object.fromEntries(descriptor.steps.map((step: any) => [step.id, input(commit, candidateProofDefinition(step))]));
}

let sourceSnapshot: any = null;
function validateSourceRecord(record: any, stepId: string, runner: string): boolean {
  sourceSnapshot ??= collectVerificationReuseSnapshot({ productRoot, projectRoot });
  return validateVerificationReuseRecord(record, { productRoot, projectRoot, snapshot: sourceSnapshot, stepId, runner });
}

function artifactEnvironment(artifact: any): any  {
  return {
    [CANDIDATE_TARBALL_ENV]: artifact.tarball,
    [CANDIDATE_PACK_METADATA_ENV]: artifact.metadataPath,
    [CANDIDATE_RELEASE_MANIFEST_ENV]: artifact.manifestPath,
  };
}

function assertManagedNode(): any  {
  const version: any = fs.readFileSync(path.join(projectRoot, '.node-version'), 'utf8').trim();
  assertMinimumNodeVersion(process.versions.node, version);
}

async function runShard(shardId: any): Promise<any>  {
  assertManagedNode();
  enforceOfflineVerification();
  const shard: any = CANDIDATE_CI_SHARDS.find((item: any) => item.id === shardId);
  if (!shard) throw new Error(`Unknown Candidate CI shard: ${shardId}`);
  const runner: any = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : process.platform;
  if (runner !== shard.runner) throw new Error(`Candidate CI shard ${shardId} requires ${shard.runner}, active runner is ${runner}`);
  const verificationSource = resolveCandidateSourceCommit(productRoot, expectedSource);
  const executionContext: any = resolveCandidateExecutionContext(productRoot, verificationSource);
  const sourceCommit = executionContext.sourceCommit;
  const registryIdentity: any = candidateCiRegistryIdentity();
  const artifactDirectory: any = path.resolve(process.env.BUILDR_CANDIDATE_CI_ARTIFACT_DIR || path.join(outputRoot, 'candidate-package'));
  const externalArtifact: any = shard.requiresArtifact ? readCandidateCiArtifact(artifactDirectory, sourceCommit) : null;
  const repair = repairPlan();
  const originalPlan = createCandidateCiShardPlan(shardId, { externalArtifact: Boolean(externalArtifact) });
  const plan: any = repair ? candidateRepairShardPlan(repair, shardId, originalPlan) : originalPlan;
  const checkInputs = checkInputsFor(shardId, verificationSource);
  const startedAtMs: any = Date.now();
  const startedAt: any = new Date(startedAtMs).toISOString();
  let results: any[] = [];
  let status: any = 'failed';
  let failure: any = null;
  let cleanupClean = false;
  const completedResults: any[] = [];
  const writeCheckpoint: any = (checkpointStatus: any = 'running') => {
    let checkpointArtifact: any = externalArtifact;
    if (!checkpointArtifact && shard.producesArtifact) {
      try { checkpointArtifact = readCandidateCiArtifact(artifactDirectory, sourceCommit); } catch {}
    }
    const checkpoint: any = createCandidateCiCheckpoint({
      id: shardId,
      ...executionContext,
      sourceCommit,
      registryIdentity,
      workflow: workflowIdentity,
      artifact: checkpointArtifact?.identity ?? null,
      expectedStepIds: shard.stepIds,
      completedResults,
      startedAt,
      updatedAt: new Date().toISOString(),
      status: checkpointStatus,
    });
    const output: any = writeCandidateCiCheckpoint(checkpointPath(shardId), checkpoint);
    process.stdout.write(`[candidate-ci] checkpoint=${output} completed=${checkpoint.completedStepIds.length}/${checkpoint.expectedStepIds.length}\n`);
  };
  try {
    fs.mkdirSync(outputRoot, { recursive: true });
    writeCheckpoint('running');
    const execution: any = await executePlan(plan, {
      productRoot,
      projectRoot,
      artifactDirectory,
      diagnosticsDirectory: path.resolve(process.env.BUILDR_DIAGNOSTICS_OUTPUT || path.join(outputRoot, `diagnostics-${shardId}`)),
      stream: process.stdout,
      errorStream: process.stderr,
      prefix: `candidate-ci:${shardId}`,
      executionProfile: resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE),
      concurrency: resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE).limits,
      env: externalArtifact ? artifactEnvironment(externalArtifact) : {},
      runId: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}-${shardId}` : `candidate-ci-${shardId}-${process.pid}`,
      taskId: `candidate-ci-${shardId}`,
      reuse: { imports: candidateSourceImportFromEnvironment(process.env), portableImports: true },
      onComplete(result: any): any  {
        completedResults.push(result);
        writeCheckpoint(result.status === 'passed' ? 'running' : 'failed');
      },
    });
    results = execution.results;
    cleanupClean = execution.cleanupClean === true;
    if (repair) {
      const selected = repair.checks.find((item: any) => item.id === shardId);
      results = selected.steps.map((item: any) => item.disposition === 'reuse' ? reusedCandidateProofResult(item.proof) : results.find(result => result.id === item.id));
    }
    status = execution.passed ? 'passed' : 'failed';
  } catch (error: any) {
    failure = error;
    results = [{ id: `${shardId}-runner`, status: 'failed', exitCode: 1, durationMs: Date.now() - startedAtMs }];
  }
  let artifact: any = externalArtifact;
  if (shard.producesArtifact) {
    try {
      artifact = readCandidateCiArtifact(artifactDirectory, sourceCommit);
    } catch (error: any) {
      failure ??= error;
      status = 'failed';
    }
  }
  const finishedAtMs: any = Date.now();
  if (completedResults.length > 0) writeCheckpoint(status === 'passed' ? 'passed' : 'failed');
  const evidence: any = createCandidateCiEvidence({
    kind: 'shard',
    id: shardId,
    ...executionContext,
    sourceCommit,
    registryIdentity,
    workflow: workflowIdentity,
    artifact: artifact?.identity ?? null,
    primaryStepIds: shard.stepIds,
    startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    status,
    results,
    checkInputs,
    cleanupClean,
  });
  const output: any = writeCandidateCiEvidence(evidencePath(shardId), evidence);
  process.stdout.write(`[candidate-ci] evidence=${output}\n`);
  if (failure) throw failure;
  if (evidence.status !== 'passed') process.exitCode = 1;
}

function assertHostNode(tuple: any): any  {
  if (tuple.expectation === 'minimum' && process.versions.node !== '24.15.0') throw new Error(`Host Node minimum tuple requires 24.15.0, active ${process.versions.node}`);
  if (tuple.expectation === 'current') assertMinimumNodeVersion(process.versions.node, '24.15.0');
}

function runHostNode(tupleId: any): any  {
  enforceOfflineVerification();
  const tuple: any = CANDIDATE_CI_HOST_NODE_TUPLES.find((item: any) => item.id === tupleId);
  if (!tuple) throw new Error(`Unknown Candidate Host Node tuple: ${tupleId}`);
  const runner: any = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : process.platform;
  if (runner !== tuple.runner) throw new Error(`Host Node tuple ${tupleId} requires ${tuple.runner}, active runner is ${runner}`);
  assertHostNode(tuple);
  const exactNode: any = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env: process.env, requireNpm: true, minimumVersion: '24.15.0' });
  const verificationSource = resolveCandidateSourceCommit(productRoot, expectedSource);
  const executionContext: any = resolveCandidateExecutionContext(productRoot, verificationSource);
  const sourceCommit = executionContext.sourceCommit;
  const artifact: any = readCandidateCiArtifact(process.env.BUILDR_CANDIDATE_CI_ARTIFACT_DIR || path.join(outputRoot, 'candidate-package'), sourceCommit);
  fs.mkdirSync(outputRoot, { recursive: true });
  const startedAtMs: any = Date.now();
  const result: any = spawnCommandSync(exactNode.nodeExecutable, [path.join(productRoot, 'tools/release/release-consumption.ts'), 'host'], {
    cwd: productRoot,
    encoding: 'utf8',
    env: {
      ...exactNode.env,
      ...artifactEnvironment(artifact),
      BUILDR_TIMING_OUTPUT: process.env.BUILDR_TIMING_OUTPUT || path.join(outputRoot, `host-node-timing-${tupleId}.json`),
      BUILDR_DIAGNOSTICS_OUTPUT: process.env.BUILDR_DIAGNOSTICS_OUTPUT || path.join(outputRoot, `host-node-diagnostics-${tupleId}`),
    },
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status === 0 && tupleId === 'host-minimum-macos') {
    const publishCheck = spawnCommandSync(exactNode.nodeExecutable, [path.join(productRoot, 'tools/release/release-consumption.ts'), 'publisher'], {
      cwd: productRoot, encoding: 'utf8', env: { ...exactNode.env, ...artifactEnvironment(artifact) }, timeout: 120_000,
    });
    if (publishCheck.stdout) process.stdout.write(publishCheck.stdout);
    if (publishCheck.stderr) process.stderr.write(publishCheck.stderr);
    if (publishCheck.status !== 0 || publishCheck.error) result.status = publishCheck.status || 1;
  }
  const finishedAtMs: any = Date.now();
  const evidence: any = createCandidateCiEvidence({
    kind: 'host-node',
    id: tupleId,
    ...executionContext,
    sourceCommit,
    registryIdentity: candidateCiRegistryIdentity(),
    workflow: workflowIdentity,
    artifact: artifact.identity,
    requestedNode: tuple.requestedNode,
    primaryStepIds: [],
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    status: result.status === 0 ? 'passed' : 'failed',
    results: [{ id: 'host-node-compatibility', status: result.status === 0 ? 'passed' : 'failed', exitCode: result.status ?? 1, durationMs: finishedAtMs - startedAtMs }],
    checkInputs: checkInputsFor(tupleId, verificationSource),
  });
  const output: any = writeCandidateCiEvidence(evidencePath(tupleId), evidence);
  process.stdout.write(`[candidate-ci] evidence=${output}\n`);
  if (evidence.status !== 'passed') process.exitCode = result.status || 1;
}

function aggregate(): any  {
  const sourceCommit: any = resolveCandidateSourceCommit(productRoot, expectedSource);
  const executionContext: any = resolveCandidateExecutionContext(productRoot, sourceCommit);
  const evidenceRoot: any = path.resolve(process.env.BUILDR_CANDIDATE_CI_EVIDENCE_DIR || outputRoot);
  const repair = repairPlan();
  const result: any = aggregateCandidateCiEvidence(readCandidateCiEvidenceFiles(evidenceRoot), executionContext, workflowIdentity, {
    validateSourceRecord, validateCandidateProof: (result: any, id: string) => repair && validateCandidateRepairProof(result, id, repair),
  });
  const output: any = path.resolve(process.env.BUILDR_CANDIDATE_CI_AGGREGATE_OUTPUT || path.join(outputRoot, 'candidate-ci-aggregate.json'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n[candidate-ci] aggregate=${output}\n`);
  if (result.status !== 'passed') process.exitCode = 1;
}

if (action === 'plan') {
  const platforms: Record<string, string> = { macos: 'macos-15', windows: 'windows-2025' };
  const reuse = planCandidateSourceReuse(CANDIDATE_CI_SHARDS, candidateSourceImportFromEnvironment(process.env), validateSourceRecord);
  if (reuse.reusedShards.length > 0) {
    const sourceCommit = resolveCandidateSourceCommit(productRoot, expectedSource);
    const executionContext = resolveCandidateExecutionContext(productRoot, sourceCommit);
    const reuseRoot = path.resolve(process.env.BUILDR_CANDIDATE_CI_EVIDENCE_DIR || outputRoot);
    for (const { shard, records } of reuse.reusedShards) {
      const environment = records[0].environment;
      const now = new Date().toISOString();
      const evidence = createCandidateCiEvidence({
        kind: 'shard', id: shard.id, ...executionContext, registryIdentity: candidateCiRegistryIdentity(), workflow: workflowIdentity,
        platform: environment.platform, arch: environment.arch, nodeVersion: environment.nodeVersion,
        primaryStepIds: shard.stepIds, artifact: null, startedAt: now, finishedAt: now, durationMs: 0, status: 'passed',
        checkInputs: checkInputsFor(shard.id, sourceCommit), cleanupClean: true,
        results: records.map((record: any) => ({ ...record.result, durationMs: 0, disposition: 'reused',
          reusedFrom: { ...record.origin, durationMs: record.result.durationMs, identity: record.identity.key }, sourceRecord: record })),
      });
      writeCandidateCiEvidence(path.join(reuseRoot, `candidate-ci-evidence-${shard.id}.json`), evidence);
    }
  }
  const matrices = {
    source: reuse.sourceShards.map((shard: any) => ({ shard: shard.id, os: platforms[shard.runner], preparation: shard.preparation })),
    artifact: CANDIDATE_CI_SHARDS.filter((shard: any) => shard.requiresArtifact).map((shard: any) => ({ shard: shard.id, os: platforms[shard.runner], preparation: shard.preparation })),
    host: CANDIDATE_CI_HOST_NODE_TUPLES.map((tuple: any) => ({ id: tuple.id, os: platforms[tuple.runner], node: tuple.requestedNode, preparation: tuple.id === 'host-minimum-macos' ? 'publisher' : 'host' })),
  };
  if (process.env.GITHUB_OUTPUT) for (const [key, include] of Object.entries(matrices)) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${JSON.stringify({ include })}\n`);
  if (process.env.GITHUB_OUTPUT) for (const [key, include] of Object.entries(matrices)) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}_required=${include.length > 0}\n`);
  process.stdout.write(`${JSON.stringify({ schemaVersion: 'buildr.candidate-ci-plan/v1', registryIdentity: candidateCiRegistryIdentity(), matrices,
    reusedSourceShards: reuse.reusedShards.map(item => item.shard.id), reusedStepIds: reuse.reusedStepIds,
    shards: CANDIDATE_CI_SHARDS, hostNodeTuples: CANDIDATE_CI_HOST_NODE_TUPLES }, null, 2)}\n`);
} else if (action === 'run' && id) await runShard(id);
else if (action === 'host' && id) runHostNode(id);
else if (action === 'aggregate') aggregate();
else {
  process.stderr.write('Usage: candidate-ci.ts <plan|run <shard>|host <tuple>|aggregate>\n');
  process.exitCode = 2;
}
