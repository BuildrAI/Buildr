import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { spawnCommandSync } from '../../src/infrastructure/process.ts';
import { readReleaseArtifact, releaseArtifactManifestName, releasePackMetadataName } from '../../../../../../skills/buildr-release/scripts/release-artifact.ts';
import { releaseConsumptionIdentity, RELEASE_CHECKS, validateReleaseCheckDefinitions } from './release/release-consumption.ts';
import {
  CANDIDATE_CI_AGGREGATE_SCHEMA,
  CANDIDATE_CI_CHECKPOINT_SCHEMA,
  CANDIDATE_CI_EVIDENCE_SCHEMA,
  CANDIDATE_EXECUTION_PURPOSES,
} from './release/candidate-ci-contract.ts';
import {
  CANDIDATE_CI_HOST_NODE_TUPLES,
  CANDIDATE_CI_PLATFORM_REPEATS,
  CANDIDATE_CI_SHARDS,
  verificationSteps,
} from './registry.ts';
import { validateCandidateCiCoverage } from './planner.ts';
import { CANDIDATE_SOURCE_REUSE_POLICY } from './candidate-source-reuse.ts';
import { createCandidateSourceBinding } from '../../../../../../skills/buildr-release/scripts/candidate-source-binding.ts';

export { CANDIDATE_CI_AGGREGATE_SCHEMA, CANDIDATE_CI_CHECKPOINT_SCHEMA, CANDIDATE_CI_EVIDENCE_SCHEMA };

const sha256: any = (value: any) => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const platformRunner: any = (platform: any = process.platform) => platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : platform;

function registryProjection(): any  {
  return {
    consumption: releaseConsumptionIdentity(),
    sourceReuse: CANDIDATE_SOURCE_REUSE_POLICY,
    shards: CANDIDATE_CI_SHARDS,
    platformRepeats: CANDIDATE_CI_PLATFORM_REPEATS,
    hostNodeTuples: CANDIDATE_CI_HOST_NODE_TUPLES,
    candidateSteps: verificationSteps.filter((item: any) => item.profiles.includes('candidate')).map((item: any) => ({
      id: item.id,
      dependsOn: item.dependsOn,
      consumesArtifact: item.executor.consumesArtifact === true,
      executor: item.executor,
      platformEvidence: item.platformEvidence ?? null,
      timeoutMs: item.timeoutMs,
      resources: item.resources,
    })),
  };
}

export function candidateCiRegistryIdentity(): any  {
  validateReleaseCheckDefinitions();
  const validation: any = validateCandidateCiCoverage();
  if (!validation.ok) throw new Error(`Invalid Candidate CI coverage: ${validation.findings.map((item: any) => `${item.step}:${item.code}`).join(', ')}`);
  const evidenceIds = new Set([...CANDIDATE_CI_SHARDS, ...CANDIDATE_CI_HOST_NODE_TUPLES].map(item => item.id));
  for (const check of RELEASE_CHECKS) if ('evidence' in check && check.evidence.some(id => !evidenceIds.has(id))) throw new Error(`Release check ${check.id} is not covered by Candidate.`);
  return sha256(registryProjection());
}

export function resolveCandidateSourceCommit(productRoot: any, expected: any = null): any  {
  const result: any = spawnCommandSync('git', ['rev-parse', 'HEAD'], { cwd: productRoot, encoding: 'utf8' });
  const sourceCommit: any = result.status === 0 ? result.stdout.trim() : '';
  if (!/^[a-f0-9]{40,64}$/.test(sourceCommit)) throw new Error(`Candidate source commit is unavailable: ${(result.stderr || result.stdout || '').trim()}`);
  if (expected && sourceCommit !== expected) throw new Error(`Candidate source commit ${sourceCommit} does not match expected ${expected}`);
  return sourceCommit;
}

export function resolveCandidateExecutionContext(productRoot: any, sourceCommit: any, env: any = process.env): any  {
  const treeResult: any = spawnCommandSync('git', ['rev-parse', `${sourceCommit}^{tree}`], { cwd: productRoot, encoding: 'utf8' });
  const sourceTree: any = treeResult.status === 0 ? treeResult.stdout.trim() : '';
  if (!/^[a-f0-9]{40,64}$/u.test(sourceTree)) throw new Error(`Candidate source tree is unavailable: ${(treeResult.stderr || treeResult.stdout || '').trim()}`);
  const purpose: any = env.BUILDR_CANDIDATE_PURPOSE || 'candidate';
  if (!CANDIDATE_EXECUTION_PURPOSES.includes(purpose)) throw new Error(`Candidate execution purpose is invalid: ${purpose}`);
  const expectedTree: any = env.BUILDR_CANDIDATE_EXPECTED_SOURCE_TREE || null;
  const rehearsalIdentity: any = env.BUILDR_RELEASE_REHEARSAL_IDENTITY || null;
  if (expectedTree && expectedTree !== sourceTree) throw new Error(`Candidate source tree ${sourceTree} does not match expected ${expectedTree}`);
  if (purpose === 'release-rehearsal' && !/^sha256-[a-f0-9]{64}$/u.test(rehearsalIdentity || '')) throw new Error('Release rehearsal requires a closed rehearsal identity.');
  if (purpose === 'candidate' && rehearsalIdentity) throw new Error('Final Candidate must not carry a release rehearsal identity.');
  if (env.BUILDR_CANDIDATE_PRODUCT_SOURCE) {
    const local = !Object.entries(env).some(([key, value]) => key.startsWith('GITHUB_') && value);
    if (purpose !== 'candidate' || !local && env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('Candidate repair requires the controlled candidate entry or a local process without GitHub identity.');
    const sourceBinding = createCandidateSourceBinding(productRoot, env.BUILDR_CANDIDATE_PRODUCT_SOURCE, sourceCommit);
    return { purpose, sourceCommit: sourceBinding.productSource, sourceTree: sourceBinding.productTree, rehearsalIdentity,
      verificationSource: sourceCommit, sourceBinding };
  }
  return { purpose, sourceCommit, sourceTree, rehearsalIdentity };
}

export function readCandidateCiArtifact(directory: any, expectedSourceCommit: any): any  {
  const root: any = path.resolve(directory);
  const manifestPath: any = path.join(root, releaseArtifactManifestName);
  const metadataPath: any = path.join(root, releasePackMetadataName);
  const artifact: any = readReleaseArtifact(manifestPath);
  if (!fs.statSync(metadataPath, { throwIfNoEntry: false })?.isFile()) throw new Error(`Candidate pack metadata is missing: ${metadataPath}`);
  if (artifact.manifest.sourceCommit !== expectedSourceCommit) {
    throw new Error(`Candidate artifact source ${artifact.manifest.sourceCommit} does not match expected ${expectedSourceCommit}`);
  }
  return {
    directory: root,
    tarball: artifact.tarball,
    manifestPath,
    metadataPath,
    identity: {
      filename: artifact.manifest.filename,
      size: artifact.manifest.size,
      sha256: artifact.manifest.sha256,
      integrity: artifact.manifest.integrity,
      applicationPayloadDigest: artifact.manifest.applicationPayloadDigest,
      sourceCommit: artifact.manifest.sourceCommit,
    },
  };
}

const diagnosticFileName: any = (value: any) => path.posix.basename(String(value).replaceAll('\\', '/'));

function resultProjection(results: any): any  {
  return results.map((item: any) => ({
    id: item.id,
    status: item.status,
    exitCode: item.exitCode,
    durationMs: item.durationMs,
    queueDurationMs: item.queueDurationMs ?? null,
    ...(item.queuedAt ? { queuedAt: item.queuedAt } : {}),
    ...(item.startedAt ? { startedAt: item.startedAt } : {}),
    ...(item.finishedAt ? { finishedAt: item.finishedAt } : {}),
    ...(item.resourceCoordination ? { resourceCoordination: item.resourceCoordination } : {}),
    phases: item.phases ?? [],
    failureCode: item.failureCode ?? null,
    processCleanup: item.processCleanup ?? null,
    ...(item.childExitCode !== undefined ? { childExitCode: item.childExitCode } : {}),
    ...(item.childSignal !== undefined ? { childSignal: item.childSignal } : {}),
    ...(item.childOutcome !== undefined ? { childOutcome: item.childOutcome } : {}),
    ...(item.failureFacts ? { failureFacts: item.failureFacts } : {}),
    ...(item.disposition ? { disposition: item.disposition } : {}),
    ...(item.reusedFrom ? { reusedFrom: item.reusedFrom } : {}),
    ...(item.sourceRecord ? { sourceRecord: item.sourceRecord } : {}),
    ...(item.artifactRecord ? { artifactRecord: item.artifactRecord } : {}),
    ...(item.candidateProof ? { candidateProof: item.candidateProof } : {}),
    ...(item.process ? { process: item.process } : {}),
    diagnostics: item.diagnostics ?? (item.stdoutPath || item.stderrPath ? {
      stdoutFile: item.stdoutPath ? diagnosticFileName(item.stdoutPath) : null,
      stderrFile: item.stderrPath ? diagnosticFileName(item.stderrPath) : null,
      ...(item.diagnosticDigests ? { stdoutDigest: item.diagnosticDigests.stdout, stderrDigest: item.diagnosticDigests.stderr } : {}),
    } : null),
  }));
}

export function createCandidateCiCheckpoint(input: any): any  {
  if (!/^[a-f0-9]{40,64}$/.test(input.sourceCommit || '')) throw new Error('Candidate CI checkpoint requires a source commit');
  if (input.registryIdentity !== candidateCiRegistryIdentity()) throw new Error('Candidate CI checkpoint registry identity is not current');
  const completedResults: any = resultProjection(input.completedResults ?? []);
  const expectedStepIds: any[] = [...(input.expectedStepIds ?? [])];
  const completedIds: any = new Set(completedResults.map((item: any) => item.id));
  if (completedResults.some((item: any) => !expectedStepIds.includes(item.id))) throw new Error('Candidate CI checkpoint contains an unexpected step');
  return {
    schemaVersion: CANDIDATE_CI_CHECKPOINT_SCHEMA,
    kind: 'shard-checkpoint',
    id: input.id,
    purpose: input.purpose,
    sourceCommit: input.sourceCommit,
    sourceTree: input.sourceTree,
    rehearsalIdentity: input.rehearsalIdentity ?? null,
    registryIdentity: input.registryIdentity,
    workflow: input.workflow ?? null,
    artifact: input.artifact ?? null,
    expectedStepIds,
    completedStepIds: expectedStepIds.filter((id: any) => completedIds.has(id)),
    completedResults,
    startedAt: input.startedAt,
    updatedAt: input.updatedAt,
    status: input.status ?? 'running',
    aggregateEligible: false,
  };
}

function writeJsonAtomic(file: any, value: any): any  {
  const target: any = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary: any = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
  return target;
}

export function writeCandidateCiCheckpoint(file: any, checkpoint: any): any  {
  if (checkpoint?.schemaVersion !== CANDIDATE_CI_CHECKPOINT_SCHEMA || checkpoint.aggregateEligible !== false) throw new Error('Invalid Candidate CI checkpoint');
  return writeJsonAtomic(file, checkpoint);
}

export function createCandidateCiEvidence(input: any): any  {
  const runner: any = platformRunner(input.platform);
  if (!['shard', 'host-node'].includes(input.kind)) throw new Error(`Invalid Candidate CI evidence kind: ${input.kind}`);
  if (!/^[a-f0-9]{40,64}$/.test(input.sourceCommit || '')) throw new Error('Candidate CI evidence requires a source commit');
  if (!/^[a-f0-9]{40,64}$/.test(input.sourceTree || '')) throw new Error('Candidate CI evidence requires a source tree');
  if (!CANDIDATE_EXECUTION_PURPOSES.includes(input.purpose)) throw new Error('Candidate CI evidence requires a supported purpose');
  if (input.registryIdentity !== candidateCiRegistryIdentity()) throw new Error('Candidate CI evidence registry identity is not current');
  const results: any = resultProjection(input.results ?? []);
  const passed: any = input.status === 'passed' && results.every((item: any) => item.status === 'passed');
  return {
    schemaVersion: CANDIDATE_CI_EVIDENCE_SCHEMA,
    kind: input.kind,
    id: input.id,
    purpose: input.purpose,
    runner: {
      os: runner,
      platform: input.platform ?? process.platform,
      arch: input.arch ?? process.arch,
      nodeVersion: input.nodeVersion ?? process.versions.node,
    },
    workflow: input.workflow ?? null,
    sourceCommit: input.sourceCommit,
    sourceTree: input.sourceTree,
    rehearsalIdentity: input.rehearsalIdentity ?? null,
    registryIdentity: input.registryIdentity,
    artifact: input.artifact ?? null,
    primaryStepIds: [...(input.primaryStepIds ?? [])],
    requestedNode: input.requestedNode ?? null,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: input.durationMs,
    status: passed ? 'passed' : 'failed',
    results,
    ...(input.checkInputs ? { checkInputs: input.checkInputs } : {}),
    ...(input.executionEnvironment ? { executionEnvironment: input.executionEnvironment } : {}),
    ...(input.cleanupClean !== undefined ? { cleanupClean: input.cleanupClean } : {}),
    ...(input.contextLifecycle ? { contextLifecycle: input.contextLifecycle } : {}),
    ...(input.fullPlanCoordination ? { fullPlanCoordination: input.fullPlanCoordination } : {}),
    ...(input.verificationSource ? { verificationSource: input.verificationSource, sourceBinding: input.sourceBinding } : {}),
  };
}

export function writeCandidateCiEvidence(file: any, evidence: any): any  {
  return writeJsonAtomic(file, evidence);
}

export function readCandidateCiEvidenceFiles(root: any): any  {
  const results: any[] = [];
  if (!fs.statSync(path.resolve(root), { throwIfNoEntry: false })?.isDirectory()) return results;
  const visit: any = (directory: any) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target: any = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && /^candidate-ci-evidence-.+\.json$/u.test(entry.name)) {
        if (fs.statSync(target).size > 8 * 1024 * 1024) throw new Error(`Candidate evidence exceeds its byte budget: ${entry.name}`);
        results.push(JSON.parse(fs.readFileSync(target, 'utf8')));
      }
    }
  };
  visit(path.resolve(root));
  return results;
}

// Preparation is diagnostic evidence, never a second eligibility authority.
// A stale, unreadable or missing receipt must not invalidate successful checks.
export function readCandidateCiPreparationFiles(root: string): any[] {
  const results: any[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && /-preparation\.json$/u.test(entry.name)) {
        try {
          if (fs.statSync(target).size <= 8 * 1024 * 1024) results.push(JSON.parse(fs.readFileSync(target, 'utf8')));
        } catch { /* Missing diagnostics remain unknown, not a failed check. */ }
      }
    }
  };
  try {
    if (fs.statSync(path.resolve(root), { throwIfNoEntry: false })?.isDirectory()) visit(path.resolve(root));
  } catch { /* An unavailable diagnostic directory does not change check facts. */ }
  return results;
}

const observedDuration = (value: any): number | null => Number.isFinite(value) && value >= 0 ? value : null;

export function candidateCiTiming(evidence: any[], preparations: any[] = []): any {
  return {
    // These are parallel, possibly nested observations. Their durations are not additive.
    durationSemantics: 'per-observation-not-additive',
    platformQueueDurationMs: null,
    agentDurationMs: null,
    unknown: ['platform-queue-not-observed', 'agent-time-not-recorded'],
    checks: evidence.map(item => {
      const runId = item.workflow?.runId, runAttempt = workflowAttempt(item.workflow?.runAttempt);
      const matching = preparations.filter(preparation => preparation?.schemaVersion === 'buildr.candidate-environment-preparation/v1'
        && preparation.id === item.id && preparation.sourceCommit === (item.verificationSource ?? item.sourceCommit)
        && runId != null && String(preparation.workflow?.runId) === String(runId) && runAttempt !== null
        && workflowAttempt(preparation.workflow?.runAttempt) === runAttempt);
      const preparation = matching.length === 1 ? matching[0] : null;
      return {
        id: item.id, workflow: item.workflow ?? null,
        startedAt: item.startedAt ?? null, finishedAt: item.finishedAt ?? null, elapsedMs: observedDuration(item.durationMs),
        preparation: preparation ? {
          status: preparation.status, profile: preparation.profile, node: preparation.node ?? null,
          startedAt: preparation.startedAt ?? null, finishedAt: preparation.finishedAt ?? null,
          elapsedMs: observedDuration(preparation.durationMs),
          operations: (Array.isArray(preparation.operations) ? preparation.operations : []).filter((operation: any) => operation && typeof operation === 'object').map((operation: any) => ({
            id: operation.id, status: operation.status, disposition: operation.disposition ?? 'unknown',
            startedAt: operation.startedAt ?? null, finishedAt: operation.finishedAt ?? null,
            elapsedMs: observedDuration(operation.durationMs),
            ...(operation.reusedFrom ? { reusedFrom: operation.reusedFrom } : {}),
          })),
        } : { status: 'unknown', elapsedMs: null, reason: matching.length > 1 ? 'preparation-record-ambiguous' : 'matching-preparation-not-observed' },
        contextLifecycle: item.contextLifecycle ?? null,
        fullPlanCoordination: item.fullPlanCoordination ?? null,
        results: (item.results ?? []).map((result: any) => ({
          id: result.id, disposition: result.disposition ?? (result.status === 'blocked' ? 'not-executed' : 'executed'), elapsedMs: observedDuration(result.durationMs),
          queueDurationMs: result.disposition === 'reused' ? null : observedDuration(result.queueDurationMs),
          resourceCoordination: result.disposition === 'reused' ? null : result.resourceCoordination ?? null,
          phases: result.disposition === 'reused' ? [] : result.phases ?? [],
          // Reused phases and time describe their origin, not work done by this run.
          ...(result.reusedFrom ? { reusedFrom: result.reusedFrom, originPhases: result.phases ?? [] } : {}),
        })),
      };
    }),
  };
}

function evidenceFinding(code: any, id: any, detail: any): any  {
  return { code, id, detail };
}

function workflowAttempt(value: any): any  {
  const attempt: any = Number(value);
  return Number.isSafeInteger(attempt) && attempt > 0 ? attempt : null;
}

export function aggregateCandidateCiEvidence(evidence: any, expectedContext: any, expectedWorkflow: any = null, options: any = {}): any  {
  const findings: any[] = [];
  const registryIdentity: any = candidateCiRegistryIdentity();
  const expectedRunId: any = expectedWorkflow?.runId == null ? null : String(expectedWorkflow.runId);
  const expectedRunAttempt: any = workflowAttempt(expectedWorkflow?.runAttempt);
  if (expectedRunId !== null && expectedRunAttempt === null) {
    findings.push(evidenceFinding('workflow-aggregate-attempt-invalid', 'Candidate gate', expectedWorkflow?.runAttempt ?? null));
  }
  const expected: any = new Map([
    ...CANDIDATE_CI_SHARDS.map((item: any) => [item.id, { kind: 'shard', runner: item.runner, platformScope: item.platformScope, primaryStepIds: item.stepIds, requiresArtifact: item.requiresArtifact || item.producesArtifact }]),
    ...CANDIDATE_CI_HOST_NODE_TUPLES.map((item: any) => [item.id, { kind: 'host-node', runner: item.runner, primaryStepIds: [], requiresArtifact: true, requestedNode: item.requestedNode }]),
  ]);
  const byId: any = new Map();
  for (const item of evidence) {
    if (item?.schemaVersion !== CANDIDATE_CI_EVIDENCE_SCHEMA) {
      findings.push(evidenceFinding('schema-invalid', item?.id ?? '<unknown>', item?.schemaVersion ?? null));
      continue;
    }
    if (byId.has(item.id)) findings.push(evidenceFinding('duplicate-evidence', item.id, null));
    else byId.set(item.id, item);
  }
  let artifactIdentity: any = null;
  const evidenceAttempts: any[] = [];
  for (const [id, expectation] of expected) {
    const item: any = byId.get(id);
    if (!item) {
      findings.push(evidenceFinding('evidence-missing', id, null));
      continue;
    }
    if (item.kind !== expectation.kind) findings.push(evidenceFinding('kind-mismatch', id, item.kind));
    if (expectation.platformScope?.kind === 'common' ? !['macos', 'windows'].includes(item.runner?.os)
      : item.runner?.os !== expectation.runner) findings.push(evidenceFinding('runner-mismatch', id, item.runner?.os));
    if (item.sourceCommit !== expectedContext.sourceCommit) findings.push(evidenceFinding('source-mismatch', id, item.sourceCommit));
    if (item.sourceTree !== expectedContext.sourceTree) findings.push(evidenceFinding('source-tree-mismatch', id, item.sourceTree));
    if (item.purpose !== expectedContext.purpose) findings.push(evidenceFinding('purpose-mismatch', id, item.purpose));
    if ((item.rehearsalIdentity ?? null) !== (expectedContext.rehearsalIdentity ?? null)) findings.push(evidenceFinding('rehearsal-identity-mismatch', id, item.rehearsalIdentity ?? null));
    if (item.registryIdentity !== registryIdentity) findings.push(evidenceFinding('registry-mismatch', id, item.registryIdentity));
    if (expectedRunId !== null) {
      const itemRunId: any = item.workflow?.runId == null ? null : String(item.workflow.runId);
      const itemRunAttempt: any = workflowAttempt(item.workflow?.runAttempt);
      if (itemRunId === null) findings.push(evidenceFinding('workflow-run-missing', id, null));
      else if (itemRunId !== expectedRunId) findings.push(evidenceFinding('workflow-run-mismatch', id, itemRunId));
      if (itemRunAttempt === null) findings.push(evidenceFinding('workflow-attempt-invalid', id, item.workflow?.runAttempt ?? null));
      else if (expectedRunAttempt !== null && itemRunAttempt > expectedRunAttempt) findings.push(evidenceFinding('workflow-attempt-future', id, itemRunAttempt));
      if (itemRunId === expectedRunId && itemRunAttempt !== null) evidenceAttempts.push({ id, runAttempt: itemRunAttempt });
    }
    if (item.status !== 'passed' || item.results.some((result: any) => result.status !== 'passed' || result.exitCode !== 0
      || result.childExitCode !== undefined && result.childExitCode !== 0 || result.childOutcome !== undefined && result.childOutcome !== 'passed'
      || result.childSignal !== undefined && result.childSignal !== null)) findings.push(evidenceFinding('result-not-passed', id, item.status));
    if (JSON.stringify(item.primaryStepIds) !== JSON.stringify(expectation.primaryStepIds)) findings.push(evidenceFinding('primary-steps-mismatch', id, item.primaryStepIds));
    for (const stepId of expectation.primaryStepIds) {
      const stepResult = item.results.find((result: any) => result.id === stepId);
      if (!stepResult) findings.push(evidenceFinding('primary-result-missing', id, stepId));
      else if (stepResult.disposition === 'reused' && stepResult.candidateProof) {
        if (!options.validateCandidateProof?.(stepResult, id)) findings.push(evidenceFinding('candidate-repair-proof-invalid', id, stepId));
      }
      else if (stepResult.disposition === 'reused' && stepResult.artifactRecord) {
        if (!options.validateArtifactRecord?.(stepResult.artifactRecord, id, item.artifact, stepId)) findings.push(evidenceFinding('artifact-reuse-invalid', id, stepId));
      }
      else if (stepResult.disposition === 'reused') {
        if (!stepResult.sourceRecord || !options.validateSourceRecord?.(stepResult.sourceRecord, stepId, expectation.runner)) {
          findings.push(evidenceFinding('source-reuse-invalid', id, stepId));
        }
      }
      if (stepResult && stepId === 'artifact-browser-core') {
        for (const phaseId of ['artifact-unpack', 'artifact-verify', 'browser:core', 'artifact-cleanup']) {
          const phases = (stepResult.phases ?? []).filter((phase: any) => phase.scope === 'candidate-browser-core' && phase.id === phaseId);
          if (phases.length === 0) findings.push(evidenceFinding('browser-phase-missing', id, phaseId));
          else if (phases.length !== 1) findings.push(evidenceFinding('browser-phase-duplicate', id, phaseId));
          else if (phases[0].status !== 'passed') findings.push(evidenceFinding('browser-phase-not-passed', id, phaseId));
        }
      }
    }
    if (expectation.requestedNode && item.requestedNode !== expectation.requestedNode) findings.push(evidenceFinding('host-node-request-mismatch', id, item.requestedNode));
    if (expectation.kind === 'host-node') for (const result of item.results) {
      if (result.disposition === 'reused' && !(result.artifactRecord
        ? options.validateArtifactRecord?.(result.artifactRecord, id, item.artifact, result.id)
        : options.validateCandidateProof?.(result, id))) findings.push(evidenceFinding('candidate-repair-proof-invalid', id, result.id));
    }
    if (expectation.kind === 'host-node' && (item.results.length !== 1 || item.results[0]?.id !== 'host-node-compatibility')) findings.push(evidenceFinding('host-node-result-missing', id, null));
    if (expectedContext.sourceBinding && (item.verificationSource !== expectedContext.verificationSource
      || !isDeepStrictEqual(item.sourceBinding, expectedContext.sourceBinding))) findings.push(evidenceFinding('verification-source-mismatch', id, item.verificationSource));
    if (expectation.requiresArtifact && !item.artifact) findings.push(evidenceFinding('artifact-missing', id, null));
    if (item.artifact) {
      if (item.artifact.sourceCommit !== expectedContext.sourceCommit) findings.push(evidenceFinding('artifact-source-mismatch', id, item.artifact.sourceCommit));
      if (!artifactIdentity) artifactIdentity = item.artifact;
      else if (!isDeepStrictEqual(item.artifact, artifactIdentity)) findings.push(evidenceFinding('artifact-identity-mismatch', id, item.artifact.sha256));
    }
  }
  for (const id of byId.keys()) if (!expected.has(id)) findings.push(evidenceFinding('unexpected-evidence', id, null));
  const deferredIds = Array.isArray(options.deferredIds) ? [...new Set(options.deferredIds)] as string[] : [];
  const validDeferred = deferredIds.every(id => {
    const descriptor = expected.get(id);
    return descriptor?.requiresArtifact && !CANDIDATE_CI_SHARDS.some((shard: any) => shard.id === id && shard.producesArtifact);
  });
  const awaitingLocal = validDeferred && findings.length > 0 && findings.every(item => item.code === 'evidence-missing' && deferredIds.includes(item.id));
  return {
    schemaVersion: CANDIDATE_CI_AGGREGATE_SCHEMA,
    purpose: expectedContext.purpose,
    sourceCommit: expectedContext.sourceCommit,
    sourceTree: expectedContext.sourceTree,
    rehearsalIdentity: expectedContext.rehearsalIdentity ?? null,
    registryIdentity,
    consumptionIdentity: releaseConsumptionIdentity(),
    artifact: artifactIdentity,
    workflow: expectedRunId === null ? null : {
      runId: expectedRunId,
      aggregateAttempt: expectedRunAttempt,
      evidenceAttempts: evidenceAttempts.sort((left: any, right: any) => left.id.localeCompare(right.id)),
    },
    status: findings.length === 0 ? 'passed' : awaitingLocal ? 'incomplete' : 'failed',
    ...(awaitingLocal ? { deferredIds: findings.map(item => item.id).sort(), awaiting: 'local-artifact-verification' } : {}),
    evidenceIds: [...byId.keys()].sort(),
    findings,
    timing: candidateCiTiming([...byId.values()], options.preparations),
    ...(expectedContext.sourceBinding ? { verificationSource: expectedContext.verificationSource, sourceBinding: expectedContext.sourceBinding } : {}),
  };
}
