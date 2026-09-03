import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnCommandSync } from '../../src/infrastructure/process.ts';
import { readReleaseArtifact, releaseArtifactManifestName, releasePackMetadataName } from '../../tools/release/release-artifact.ts';
import {
  CANDIDATE_CI_HOST_NODE_TUPLES,
  CANDIDATE_CI_PLATFORM_REPEATS,
  CANDIDATE_CI_SHARDS,
  verificationSteps,
} from './registry.ts';
import { validateCandidateCiCoverage } from './planner.ts';

export const CANDIDATE_CI_EVIDENCE_SCHEMA: any = 'buildr.candidate-ci-evidence/v1';
export const CANDIDATE_CI_AGGREGATE_SCHEMA: any = 'buildr.candidate-ci-aggregate/v1';
export const CANDIDATE_CI_CHECKPOINT_SCHEMA: any = 'buildr.candidate-ci-checkpoint/v1';

const sha256: any = (value: any) => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const platformRunner: any = (platform: any = process.platform) => platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : platform;

function registryProjection(): any  {
  return {
    shards: CANDIDATE_CI_SHARDS,
    platformRepeats: CANDIDATE_CI_PLATFORM_REPEATS,
    hostNodeTuples: CANDIDATE_CI_HOST_NODE_TUPLES,
    candidateSteps: verificationSteps.filter((item: any) => item.profiles.includes('candidate')).map((item: any) => ({
      id: item.id,
      dependsOn: item.dependsOn,
      consumesArtifact: item.executor.consumesArtifact === true,
      executor: item.executor.type,
      timeoutMs: item.timeoutMs,
      resources: item.resources,
    })),
  };
}

export function candidateCiRegistryIdentity(): any  {
  const validation: any = validateCandidateCiCoverage();
  if (!validation.ok) throw new Error(`Invalid Candidate CI coverage: ${validation.findings.map((item: any) => `${item.step}:${item.code}`).join(', ')}`);
  return sha256(registryProjection());
}

export function resolveCandidateSourceCommit(productRoot: any, expected: any = null): any  {
  const result: any = spawnCommandSync('git', ['rev-parse', 'HEAD'], { cwd: productRoot, encoding: 'utf8' });
  const sourceCommit: any = result.status === 0 ? result.stdout.trim() : '';
  if (!/^[a-f0-9]{40,64}$/.test(sourceCommit)) throw new Error(`Candidate source commit is unavailable: ${(result.stderr || result.stdout || '').trim()}`);
  if (expected && sourceCommit !== expected) throw new Error(`Candidate source commit ${sourceCommit} does not match expected ${expected}`);
  return sourceCommit;
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
    phases: item.phases ?? [],
    failureCode: item.failureCode ?? null,
    processCleanup: item.processCleanup ?? null,
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
    sourceCommit: input.sourceCommit,
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
  if (input.registryIdentity !== candidateCiRegistryIdentity()) throw new Error('Candidate CI evidence registry identity is not current');
  const results: any = resultProjection(input.results ?? []);
  const passed: any = input.status === 'passed' && results.every((item: any) => item.status === 'passed');
  return {
    schemaVersion: CANDIDATE_CI_EVIDENCE_SCHEMA,
    kind: input.kind,
    id: input.id,
    runner: {
      os: runner,
      platform: input.platform ?? process.platform,
      arch: input.arch ?? process.arch,
      nodeVersion: input.nodeVersion ?? process.versions.node,
    },
    workflow: input.workflow ?? null,
    sourceCommit: input.sourceCommit,
    registryIdentity: input.registryIdentity,
    artifact: input.artifact ?? null,
    primaryStepIds: [...(input.primaryStepIds ?? [])],
    requestedNode: input.requestedNode ?? null,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: input.durationMs,
    status: passed ? 'passed' : 'failed',
    results,
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
      else if (entry.isFile() && /^candidate-ci-evidence-.+\.json$/u.test(entry.name)) results.push(JSON.parse(fs.readFileSync(target, 'utf8')));
    }
  };
  visit(path.resolve(root));
  return results;
}

function evidenceFinding(code: any, id: any, detail: any): any  {
  return { code, id, detail };
}

function workflowAttempt(value: any): any  {
  const attempt: any = Number(value);
  return Number.isSafeInteger(attempt) && attempt > 0 ? attempt : null;
}

export function aggregateCandidateCiEvidence(evidence: any, expectedSourceCommit: any, expectedWorkflow: any = null): any  {
  const findings: any[] = [];
  const registryIdentity: any = candidateCiRegistryIdentity();
  const expectedRunId: any = expectedWorkflow?.runId == null ? null : String(expectedWorkflow.runId);
  const expectedRunAttempt: any = workflowAttempt(expectedWorkflow?.runAttempt);
  if (expectedRunId !== null && expectedRunAttempt === null) {
    findings.push(evidenceFinding('workflow-aggregate-attempt-invalid', 'Candidate gate', expectedWorkflow?.runAttempt ?? null));
  }
  const expected: any = new Map([
    ...CANDIDATE_CI_SHARDS.map((item: any) => [item.id, { kind: 'shard', runner: item.runner, primaryStepIds: item.stepIds, requiresArtifact: item.requiresArtifact || item.producesArtifact }]),
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
    if (item.runner?.os !== expectation.runner) findings.push(evidenceFinding('runner-mismatch', id, item.runner?.os));
    if (item.sourceCommit !== expectedSourceCommit) findings.push(evidenceFinding('source-mismatch', id, item.sourceCommit));
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
    if (item.status !== 'passed' || item.results.some((result: any) => result.status !== 'passed')) findings.push(evidenceFinding('result-not-passed', id, item.status));
    if (JSON.stringify(item.primaryStepIds) !== JSON.stringify(expectation.primaryStepIds)) findings.push(evidenceFinding('primary-steps-mismatch', id, item.primaryStepIds));
    if (expectation.requestedNode && item.requestedNode !== expectation.requestedNode) findings.push(evidenceFinding('host-node-request-mismatch', id, item.requestedNode));
    if (expectation.requiresArtifact && !item.artifact) findings.push(evidenceFinding('artifact-missing', id, null));
    if (item.artifact) {
      if (item.artifact.sourceCommit !== expectedSourceCommit) findings.push(evidenceFinding('artifact-source-mismatch', id, item.artifact.sourceCommit));
      if (!artifactIdentity) artifactIdentity = item.artifact;
      else if (JSON.stringify(item.artifact) !== JSON.stringify(artifactIdentity)) findings.push(evidenceFinding('artifact-identity-mismatch', id, item.artifact.sha256));
    }
  }
  for (const id of byId.keys()) if (!expected.has(id)) findings.push(evidenceFinding('unexpected-evidence', id, null));
  return {
    schemaVersion: CANDIDATE_CI_AGGREGATE_SCHEMA,
    sourceCommit: expectedSourceCommit,
    registryIdentity,
    artifact: artifactIdentity,
    workflow: expectedRunId === null ? null : {
      runId: expectedRunId,
      aggregateAttempt: expectedRunAttempt,
      evidenceAttempts: evidenceAttempts.sort((left: any, right: any) => left.id.localeCompare(right.id)),
    },
    status: findings.length === 0 ? 'passed' : 'failed',
    evidenceIds: [...byId.keys()].sort(),
    findings,
  };
}
