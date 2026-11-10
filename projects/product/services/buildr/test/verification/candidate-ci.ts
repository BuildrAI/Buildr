#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { LOCAL_PACKAGE_MODEL, validatePackageHandoff } from '../../../../../../skills/buildr-release/scripts/local-package-handoff.ts';
import { localPackageCoverage } from './local-package-coverage.ts';
import { assertMinimumNodeVersion, createExactNodeExecutionEnvironment, spawnCommandSync } from '../../src/infrastructure/process.ts';
import { enforceOfflineVerification } from '../../src/infrastructure/network/verification-network-policy.ts';
import { executePlan } from './plan-runner.ts';
import { createCandidateCiShardPlan } from './planner.ts';
import { candidateSourceImportFromEnvironment, candidateSourceShardReuse, planCandidateSourceReuse, reusedCandidateSourceResult,
  selectLocalPackageShards, validateCandidateSourceRecord } from './candidate-source-reuse.ts';
import { assertFrozenCandidateCheckout, candidateArtifactImportFromEnvironment, candidateDeferredArtifactIds, candidateDependencyInputsIdentity, createCandidateDeferredPlan,
  createCandidateExecutionEnvironment, readCandidateDeferredPlan, reusableCandidateArtifactStepIds, reusedCandidateArtifactResult, validateCandidateArtifactEvidence } from './candidate-artifact-reuse.ts';
import { collectVerificationReuseSnapshot } from './verification-reuse.ts';
import { localPackageVerifierBinding } from '../../../../../../skills/buildr-release/scripts/local-package-verifier-binding.ts';
import { createCandidateSourceBinding } from '../../../../../../skills/buildr-release/scripts/candidate-source-binding.ts';
import { createCandidateCheckInputReader } from './candidate-check-inputs.ts';
import { applyCandidateDeclaredScope, CANDIDATE_DECLARED_SCOPE_ENV, parseCandidateDeclaredScope } from './candidate-declared-scope.ts';
import {
  aggregateCandidateCiEvidence,
  candidateCiRegistryIdentity,
  createCandidateCiCheckpoint,
  createCandidateCiEvidence,
  readCandidateCiArtifact,
  readCandidateCiEvidenceFiles,
  readCandidateCiPreparationFiles,
  resolveCandidateExecutionContext as originalExecutionContext,
  resolveCandidateSourceCommit,
  writeCandidateCiEvidence,
  writeCandidateCiCheckpoint,
} from './candidate-ci-evidence.ts';
import {
  CANDIDATE_PACK_METADATA_ENV,
  CANDIDATE_RELEASE_MANIFEST_ENV,
  CANDIDATE_TARBALL_ENV,
} from '../../../../../../skills/buildr-release/scripts/candidate-package.ts';

const verifierRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const independent = localPackageVerifierBinding({ verifierRoot, action: process.argv[2] ?? '', env: process.env });
const productRoot: any = independent.productRoot;
// Recipes and proof inputs still describe the original product, not the repair.
const { CANDIDATE_CI_HOST_NODE_TUPLES, CANDIDATE_CI_SHARDS, resolveVerificationExecutionProfile, verificationSteps } =
  await import(pathToFileURL(path.join(productRoot, 'test/verification/registry.ts')).href) as typeof import('./registry.ts');
const { assertCandidateRepairPlan, candidateProofDefinition, candidateProofDescriptors, candidateRepairShardPlan, reusedCandidateProofResult, validateCandidateRepairProof } =
  await import(pathToFileURL(path.join(productRoot, 'test/verification/candidate-repair.ts')).href) as typeof import('./candidate-repair.ts');
function resolveCandidateExecutionContext(root: string, source: string): any {
  const context = originalExecutionContext(root, source);
  if (!independent.binding) return context;
  if (process.env.BUILDR_CANDIDATE_PRODUCT_SOURCE || process.env.BUILDR_CANDIDATE_REPAIR_PLAN) {
    throw new Error('Independent local consumption cannot be combined with a remote repair.');
  }
  return { ...context, verificationSource: independent.binding.verificationSource, sourceBinding: independent.binding };
}
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

function localPackageHandoff(): any {
  const file = process.env.BUILDR_LOCAL_PACKAGE_HANDOFF;
  if (!file) return null;
  const handoff = validatePackageHandoff(JSON.parse(fs.readFileSync(file, 'utf8')));
  const source = resolveCandidateSourceCommit(productRoot, expectedSource);
  const context = resolveCandidateExecutionContext(productRoot, source);
  if (handoff.sourceCommit !== source || handoff.sourceTree !== context.sourceTree
    || parseCandidateDeclaredScope(process.env[CANDIDATE_DECLARED_SCOPE_ENV])?.identity !== handoff.verificationScope?.identity) {
    throw new Error('Local package handoff source or frozen verification scope differs.');
  }
  return handoff;
}

/** The maintenance decision is explicit input, never inferred from a failed or
 * absent check. Excluding a boundary removes whole shards from the round and
 * records the real reason; an undeclared gap still fails the aggregate. */
function candidateScope(): any {
  const scope = parseCandidateDeclaredScope(process.env[CANDIDATE_DECLARED_SCOPE_ENV]);
  const view = applyCandidateDeclaredScope({
    scope, shards: CANDIDATE_CI_SHARDS, hostNodeTuples: CANDIDATE_CI_HOST_NODE_TUPLES,
    executionBoundaryOf: (stepId: string) => {
      const step: any = verificationSteps.find((item: any) => item.id === stepId);
      // The package-producing step is a build prerequisite, not a test boundary.
      return step?.executor?.type === 'candidate-artifact' ? undefined : step?.testing?.executionBoundary;
    },
  });
  const handoff = localPackageHandoff();
  if (handoff) {
    view.shards = selectLocalPackageShards(view.shards, verificationSteps, handoff.localRunner);
    const coverage = localPackageCoverage(handoff, view.shards, view.hostNodeTuples);
    view.shards = coverage.shards;
    view.hostNodeTuples = coverage.hostNodeTuples;
  }
  return { scope, ...view, evidenceIds: new Set([...view.shards.map((item: any) => item.id), ...view.hostNodeTuples.map((item: any) => item.id)]) };
}

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

let checkInputReader: ReturnType<typeof createCandidateCheckInputReader> | undefined;
function checkInputsFor(id: string, commit: string): any {
  const descriptor = candidateProofDescriptors().find(item => item.id === id);
  const input = checkInputReader ??= createCandidateCheckInputReader(productRoot);
  return Object.fromEntries(descriptor.steps.map((step: any) => [step.id, input(commit, candidateProofDefinition(step))]));
}

let sourceReuseSnapshot: ReturnType<typeof collectVerificationReuseSnapshot> | undefined;
function validateSourceRecord(record: any, stepId: string, runner: string): boolean {
  const step = verificationSteps.find((item: any) => item.id === stepId);
  if (!step) return false;
  sourceReuseSnapshot ??= collectVerificationReuseSnapshot({ productRoot, steps: verificationSteps });
  return validateCandidateSourceRecord({ record, step, runner, selectionId: process.env.BUILDR_SELECTION_ID, snapshot: sourceReuseSnapshot });
}

function artifactRecordSourceMatches(record: any): boolean {
  try {
    const source = record.verificationSource ?? record.sourceCommit;
    const binding = createCandidateSourceBinding(productRoot, record.sourceCommit, source,
      record.sourceBinding?.schemaVersion === 'buildr.candidate-source-binding/v1' ? null : record.sourceBinding?.inputPolicy);
    return record.sourceTree === binding.productTree && (!record.verificationSource
      ? !record.sourceBinding : isDeepStrictEqual(record.sourceBinding, binding));
  } catch { return false; }
}

function validateArtifactRecord(record: any, evidenceId: string, artifact?: any, stepId?: string): boolean {
  const verificationSource = resolveCandidateSourceCommit(productRoot, expectedSource);
  const context = resolveCandidateExecutionContext(productRoot, verificationSource);
  const descriptor = candidateProofDescriptors().find(item => item.id === evidenceId);
  if (!descriptor || !artifactRecordSourceMatches(record)) return false;
  const inputs = checkInputsFor(evidenceId, verificationSource);
  const environment = { dependencyInputsIdentity: candidateDependencyInputsIdentity(productRoot, verificationSource,
    descriptor.preparation ?? (descriptor.kind === 'host-node' ? descriptor.id === 'host-minimum-macos' ? 'publisher' : 'host' : 'base')) };
  return validateCandidateArtifactEvidence(record, descriptor, context, inputs, artifact, environment)
    || Boolean(stepId && reusableCandidateArtifactStepIds(record, descriptor, context, inputs, artifact,
      { ...environment, ...(workflowIdentity && localPackageHandoff() ? { retryWorkflow: workflowIdentity } : {}) }).includes(stepId));
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
  const scope = candidateScope();
  const shard: any = scope.shards.find((item: any) => item.id === shardId);
  if (!shard) throw new Error(`Candidate CI shard ${shardId} is unknown or excluded by the declared verification scope.`);
  const runner: any = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : process.platform;
  if (runner !== shard.runner && !(shard.platformScope?.kind === 'common' && ['macos', 'windows'].includes(runner))) throw new Error(`Candidate CI shard ${shardId} requires ${shard.runner}, active runner is ${runner}`);
  const verificationSource = resolveCandidateSourceCommit(productRoot, expectedSource);
  if (!workflowIdentity) assertFrozenCandidateCheckout(productRoot, verificationSource);
  const executionContext: any = resolveCandidateExecutionContext(productRoot, verificationSource);
  const sourceCommit = executionContext.sourceCommit;
  const registryIdentity: any = candidateCiRegistryIdentity();
  const artifactDirectory: any = path.resolve(process.env.BUILDR_CANDIDATE_CI_ARTIFACT_DIR || path.join(outputRoot, 'candidate-package'));
  const externalArtifact: any = shard.requiresArtifact ? readCandidateCiArtifact(artifactDirectory, sourceCommit) : null;
  const repair = repairPlan();
  const originalPlan = createCandidateCiShardPlan(shardId, { externalArtifact: Boolean(externalArtifact), stepIds: shard.stepIds });
  const checkInputs = checkInputsFor(shardId, verificationSource);
  const sourceReused = !shard.requiresArtifact && !shard.producesArtifact
    ? candidateSourceShardReuse(shard, candidateSourceImportFromEnvironment(process.env), validateSourceRecord).reused
      .map(item => reusedCandidateSourceResult(item.record))
    : [];
  let localReused: any[] = [];
  const hostedPackageRetry = workflowIdentity && localPackageHandoff();
  if ((!Object.entries(process.env).some(([key, value]) => key.startsWith('GITHUB_') && value) || hostedPackageRetry) && externalArtifact) {
    try {
      const previous = JSON.parse(fs.readFileSync(evidencePath(shardId), 'utf8'));
      const descriptor = candidateProofDescriptors().find(item => item.id === shardId);
      const reusable = artifactRecordSourceMatches(previous) ? reusableCandidateArtifactStepIds(previous, descriptor, executionContext, checkInputs,
        externalArtifact.identity, { executionEnvironment: createCandidateExecutionEnvironment(productRoot, checkInputs, process.env, { preparation: shard.preparation }),
          ...(hostedPackageRetry ? { retryWorkflow: workflowIdentity } : {}) }) : [];
      localReused = reusable.map(stepId => reusedCandidateArtifactResult(previous, stepId));
    } catch { /* Invalid, stale or incomplete prior proof must execute again. */ }
  }
  const reusedResults = [...sourceReused, ...localReused];
  const reusedIds = new Set(reusedResults.map(result => result.id));
  const plan: any = repair ? candidateRepairShardPlan(repair, shardId, originalPlan) : { ...originalPlan,
    steps: originalPlan.steps.filter((step: any) => !reusedIds.has(step.id)).map((step: any) => ({ ...step,
      dependsOn: step.dependsOn.filter((dependency: string) => !reusedIds.has(dependency)) })) };
  const startedAtMs: any = Date.now();
  const startedAt: any = new Date(startedAtMs).toISOString();
  let results: any[] = [];
  let status: any = 'failed';
  let failure: any = null;
  let cleanupClean = false;
  let contextLifecycle: any = null;
  let fullPlanCoordination: any = null;
  const completedResults: any[] = [...reusedResults];
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
      env: { ...(externalArtifact ? artifactEnvironment(externalArtifact) : {}), BUILDR_DEVELOPMENT_PREPARE_SKIP: '1' },
      runId: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}-${shardId}` : `candidate-ci-${shardId}-${process.pid}`,
      taskId: `candidate-ci-${shardId}`,
      reuse: false,
      round: { roundId: process.env.BUILDR_SELECTION_ID ?? `ci-${process.env.GITHUB_RUN_ID ?? process.pid}`,
        imports: process.env.BUILDR_SOURCE_VERIFICATION || process.env.BUILDR_SOURCE_VERIFICATION_FILE ? candidateSourceImportFromEnvironment(process.env) : undefined },
      onComplete(result: any): any  {
        completedResults.push(result);
        writeCheckpoint(result.status === 'passed' ? 'running' : 'failed');
      },
    });
    results = execution.results;
    contextLifecycle = execution.contextLifecycle;
    fullPlanCoordination = execution.fullPlanCoordination;
    cleanupClean = execution.cleanupClean === true;
    if (repair) {
      const selected = repair.checks.find((item: any) => item.id === shardId);
      results = selected.steps.map((item: any) => item.disposition === 'reuse' ? reusedCandidateProofResult(item.proof) : results.find(result => result.id === item.id));
    } else if (reusedResults.length > 0) {
      results = shard.stepIds.map((stepId: string) => reusedResults.find(result => result.id === stepId) ?? results.find(result => result.id === stepId)).filter(Boolean);
    }
    if (!workflowIdentity) assertFrozenCandidateCheckout(productRoot, verificationSource);
    const complete = results.length === shard.stepIds.length && results.every(result => result?.status === 'passed');
    status = execution.passed && complete ? 'passed' : 'failed';
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
    ...(shard.requiresArtifact ? { executionEnvironment: createCandidateExecutionEnvironment(productRoot, checkInputs, process.env, { preparation: shard.preparation }) } : {}),
    cleanupClean,
    contextLifecycle,
    fullPlanCoordination,
  });
  const output: any = writeCandidateCiEvidence(evidencePath(shardId), evidence);
  process.stdout.write(`[candidate-ci] evidence=${output}\n`);
  if (failure) throw failure;
  if (evidence.status !== 'passed') process.exitCode = 1;
}

function assertHostNode(tuple: any): any  {
  if (tuple.expectation === 'minimum' && process.versions.node !== '24.15.0') throw new Error(`Host Node minimum tuple requires 24.15.0, active ${process.versions.node}`);
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
  if (!workflowIdentity) assertFrozenCandidateCheckout(productRoot, verificationSource);
  const executionContext: any = resolveCandidateExecutionContext(productRoot, verificationSource);
  const sourceCommit = executionContext.sourceCommit;
  const artifact: any = readCandidateCiArtifact(process.env.BUILDR_CANDIDATE_CI_ARTIFACT_DIR || path.join(outputRoot, 'candidate-package'), sourceCommit);
  fs.mkdirSync(outputRoot, { recursive: true });
  const startedAtMs: any = Date.now();
  const result: any = spawnCommandSync(exactNode.nodeExecutable, [path.join(productRoot, 'test/verification/release/release-consumption.ts'), 'host'], {
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
    const publishCheck = spawnCommandSync(exactNode.nodeExecutable, [path.join(productRoot, 'test/verification/release/release-consumption.ts'), 'publisher'], {
      cwd: productRoot, encoding: 'utf8', env: { ...exactNode.env, ...artifactEnvironment(artifact) }, timeout: 120_000,
    });
    if (publishCheck.stdout) process.stdout.write(publishCheck.stdout);
    if (publishCheck.stderr) process.stderr.write(publishCheck.stderr);
    if (publishCheck.status !== 0 || publishCheck.error) result.status = publishCheck.status || 1;
  }
  const finishedAtMs: any = Date.now();
  if (!workflowIdentity) assertFrozenCandidateCheckout(productRoot, verificationSource);
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
    executionEnvironment: createCandidateExecutionEnvironment(productRoot, checkInputsFor(tupleId, verificationSource), process.env,
      { preparation: tupleId === 'host-minimum-macos' ? 'publisher' : 'host' }),
    cleanupClean: result.status === 0,
  });
  const output: any = writeCandidateCiEvidence(evidencePath(tupleId), evidence);
  process.stdout.write(`[candidate-ci] evidence=${output}\n`);
  if (evidence.status !== 'passed') process.exitCode = result.status || 1;
}

function aggregate(): any  {
  const startedAtMs = Date.now();
  const sourceCommit: any = resolveCandidateSourceCommit(productRoot, expectedSource);
  const executionContext: any = resolveCandidateExecutionContext(productRoot, sourceCommit);
  const evidenceRoot: any = path.resolve(process.env.BUILDR_CANDIDATE_CI_EVIDENCE_DIR || outputRoot);
  const repair = repairPlan();
  const scope = candidateScope();
  if (repair && scope.scope) throw new Error('A formal Candidate repair cannot be combined with a declared verification scope.');
  const result: any = aggregateCandidateCiEvidence(readCandidateCiEvidenceFiles(evidenceRoot), executionContext, workflowIdentity, {
    validateSourceRecord, validateArtifactRecord, validateCandidateProof: (result: any, id: string) => repair && validateCandidateRepairProof(result, id, repair),
    deferredIds: repair ? [] : readCandidateDeferredPlan(evidenceRoot, executionContext, candidateCiRegistryIdentity(), workflowIdentity, candidateProofDescriptors()),
    preparations: readCandidateCiPreparationFiles(evidenceRoot),
    shards: scope.shards,
    hostNodeTuples: scope.hostNodeTuples,
    declaredScope: scope.scope,
    notRun: scope.notRun,
  });
  const handoff = localPackageHandoff();
  if (handoff) {
    const artifact = readCandidateCiArtifact(process.env.BUILDR_CANDIDATE_CI_ARTIFACT_DIR, sourceCommit);
    if (artifact.identity.sha256 !== handoff.artifactSha256) throw new Error('Aggregated package bytes differ from the local producer.');
    result.executionModel = LOCAL_PACKAGE_MODEL;
    result.packageHandoff = handoff;
    result.artifact = artifact.identity;
    const coverage = localPackageCoverage(handoff, CANDIDATE_CI_SHARDS, CANDIDATE_CI_HOST_NODE_TUPLES);
    if (coverage.platformVerification) result.platformVerification = coverage.platformVerification;
  }
  result.timing.aggregation = { startedAt: new Date(startedAtMs).toISOString(), finishedAt: new Date().toISOString(), elapsedMs: Date.now() - startedAtMs };
  const output: any = path.resolve(process.env.BUILDR_CANDIDATE_CI_AGGREGATE_OUTPUT || path.join(outputRoot, 'candidate-ci-aggregate.json'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n[candidate-ci] aggregate=${output}\n`);
  if (!['passed', 'incomplete'].includes(result.status)) process.exitCode = 1;
}

if (action === 'plan') {
  const platforms: Record<string, string> = { macos: 'macos-15', windows: 'windows-2025' };
  const scope = candidateScope();
  const reuse = planCandidateSourceReuse(scope.shards, candidateSourceImportFromEnvironment(process.env), validateSourceRecord);
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
        results: records.map(reusedCandidateSourceResult),
      });
      writeCandidateCiEvidence(path.join(reuseRoot, `candidate-ci-evidence-${shard.id}.json`), evidence);
    }
  }
  const verificationSource = resolveCandidateSourceCommit(productRoot, expectedSource);
  const executionContext = resolveCandidateExecutionContext(productRoot, verificationSource);
  const reuseRoot = path.resolve(process.env.BUILDR_CANDIDATE_CI_EVIDENCE_DIR || outputRoot);
  const descriptors = candidateProofDescriptors();
  const imports = candidateArtifactImportFromEnvironment(process.env);
  const adoptedIds = new Set<string>();
  for (const descriptor of descriptors.filter(item => scope.evidenceIds.has(item.id) && item.requiresArtifact && !item.producesArtifact)) {
    const original = imports.find(item => validateArtifactRecord(item, descriptor.id));
    if (!original) continue;
    const now = new Date().toISOString();
    const evidence = createCandidateCiEvidence({ kind: descriptor.kind, id: descriptor.id, ...executionContext,
      registryIdentity: candidateCiRegistryIdentity(), workflow: workflowIdentity, platform: original.runner.platform,
      arch: original.runner.arch, nodeVersion: original.runner.nodeVersion, requestedNode: descriptor.requestedNode,
      primaryStepIds: descriptor.kind === 'shard' ? descriptor.stepIds : [], artifact: original.artifact,
      checkInputs: original.checkInputs, executionEnvironment: original.executionEnvironment,
      startedAt: now, finishedAt: now, durationMs: 0, status: 'passed', cleanupClean: true,
      results: descriptor.steps.map((step: any) => reusedCandidateArtifactResult(original, step.id)) });
    writeCandidateCiEvidence(path.join(reuseRoot, `candidate-ci-evidence-${descriptor.id}.json`), evidence);
    adoptedIds.add(descriptor.id);
  }
  const deferredIds = candidateDeferredArtifactIds(descriptors, process.env.BUILDR_CANDIDATE_LOCAL_RUNNER).filter(id => scope.evidenceIds.has(id) && !adoptedIds.has(id));
  if (deferredIds.length > 0) writeCandidateCiEvidence(path.join(reuseRoot, 'candidate-ci-deferred-plan.json'), createCandidateDeferredPlan({
    ...executionContext, registryIdentity: candidateCiRegistryIdentity(), workflow: workflowIdentity,
    localRunner: process.env.BUILDR_CANDIDATE_LOCAL_RUNNER, deferredIds }));
  const selected = (id: string) => scope.evidenceIds.has(id) && !adoptedIds.has(id) && !deferredIds.includes(id);
  const matrices = {
    source: reuse.sourceShards.map((shard: any) => ({ shard: shard.id, os: platforms[shard.runner], preparation: shard.preparation })),
    artifact: scope.shards.filter((shard: any) => shard.requiresArtifact && selected(shard.id)).map((shard: any) => ({ shard: shard.id, os: platforms[shard.runner], preparation: shard.preparation })),
    host: scope.hostNodeTuples.filter((tuple: any) => selected(tuple.id)).map((tuple: any) => ({ id: tuple.id, os: platforms[tuple.runner], node: tuple.requestedNode, preparation: tuple.id === 'host-minimum-macos' ? 'publisher' : 'host' })),
  };
  const handoff = localPackageHandoff();
  if (handoff && (matrices.source.length || matrices.artifact.some((item: any) => scope.shards.find((shard: any) => shard.id === item.shard)?.platformScope.kind !== 'platform'
    || scope.shards.find((shard: any) => shard.id === item.shard)?.runner !== handoff.remoteRunner)
    || matrices.host.some((item: any) => scope.hostNodeTuples.find((tuple: any) => tuple.id === item.id)?.runner !== handoff.remoteRunner))) {
    throw new Error('Local package proof is incomplete; remote execution cannot replace local source or common artifact checks.');
  }
  if (process.env.GITHUB_OUTPUT) for (const [key, include] of Object.entries(matrices)) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${JSON.stringify({ include })}\n`);
  if (process.env.GITHUB_OUTPUT) for (const [key, include] of Object.entries(matrices)) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}_required=${include.length > 0}\n`);
  process.stdout.write(`${JSON.stringify({ schemaVersion: 'buildr.candidate-ci-plan/v1', registryIdentity: candidateCiRegistryIdentity(), matrices,
    reusedSourceShards: reuse.reusedShards.map(item => item.shard.id), reusedStepIds: reuse.reusedStepIds,
    reusedArtifactIds: [...adoptedIds], deferredIds,
    ...(scope.scope ? { declaredScope: scope.scope, notRun: scope.notRun } : {}),
    shards: CANDIDATE_CI_SHARDS, hostNodeTuples: CANDIDATE_CI_HOST_NODE_TUPLES }, null, 2)}\n`);
} else if (action === 'run' && id) {
  try { await runShard(id); }
  catch (error) {
    // Preserve the finalization error even when large forwarded child output
    // exceeds the hosted step's console stream or is truncated on exit.
    if (process.env.BUILDR_DIAGNOSTICS_OUTPUT) {
      fs.mkdirSync(process.env.BUILDR_DIAGNOSTICS_OUTPUT, { recursive: true });
      fs.writeFileSync(path.join(process.env.BUILDR_DIAGNOSTICS_OUTPUT, 'candidate-finalization-error.txt'), error instanceof Error ? error.stack || error.message : String(error));
    }
    throw error;
  }
}
else if (action === 'host' && id) runHostNode(id);
else if (action === 'aggregate') aggregate();
else {
  process.stderr.write('Usage: candidate-ci.ts <plan|run <shard>|host <tuple>|aggregate>\n');
  process.exitCode = 2;
}
