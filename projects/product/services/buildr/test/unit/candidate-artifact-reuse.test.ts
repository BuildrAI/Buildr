import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  candidateArtifactImportFromEnvironment,
  decodeCandidateArtifactImport, encodeCandidateArtifactImport, MAX_ARTIFACT_IMPORT_CHARACTERS,
  reusableCandidateArtifactStepIds,
  reusedCandidateArtifactResult,
  validateCandidateArtifactEvidence,
} from '../verification/candidate-artifact-reuse.ts';

const hash = (value: unknown) => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const context = { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), purpose: 'candidate' };
const artifact = { sourceCommit: context.sourceCommit, filename: 'buildr.tgz', size: 12, sha256: 'c'.repeat(64),
  integrity: 'sha512-ZmFrZQ==', applicationPayloadDigest: `sha256-${'d'.repeat(64)}` };
const descriptor = { id: 'runtime-macos', kind: 'shard', runner: 'macos', requiresArtifact: true,
  platformScope: { kind: 'platform', runners: ['macos'] }, steps: [{ id: 'release-tarball-smoke' }] };
const inputs = { 'release-tarball-smoke': hash('inputs') };
function evidence(target: any = descriptor, platform = 'darwin', nodeVersion = '24.21.0'): any {
  const checkInputs = Object.fromEntries(target.steps.map((step: any) => [step.id, inputs['release-tarball-smoke']]));
  const environment = { schemaVersion: 'buildr.candidate-execution-environment/v1', platform, arch: platform === 'darwin' ? 'arm64' : 'x64',
    preparation: target.preparation ?? (target.kind === 'host-node' ? target.id === 'host-minimum-macos' ? 'publisher' : 'host' : 'base'),
    nodeVersion, nodeExecutable: '/actual/node', npmVersion: '11.19.0', dependencyIdentity: hash('actual-installed-bytes'), dependencyInputsIdentity: hash('locked-dependencies-and-recipe'),
    variablesIdentity: hash({}), inputsIdentity: hash(checkInputs) };
  return { schemaVersion: 'buildr.candidate-ci-evidence/v2', id: target.id, kind: target.kind, ...context,
    workflow: null, runner: { os: platform === 'darwin' ? 'macos' : 'windows', platform, arch: environment.arch, nodeVersion },
    artifact, checkInputs, executionEnvironment: { ...environment, identity: hash(environment) },
    requestedNode: target.requestedNode ?? null, primaryStepIds: target.kind === 'shard' ? target.steps.map((step: any) => step.id) : [],
    status: 'passed', cleanupClean: true, durationMs: 100, startedAt: '2026-10-17T00:00:00Z', finishedAt: '2026-10-17T00:00:01Z',
    results: target.steps.map((step: any) => ({ id: step.id, status: 'passed', exitCode: 0, durationMs: 100, processCleanup: { status: 'clean' } })) };
}

test('artifact transport preserves local origin and never accepts an aggregate as proof', () => {
  const original = evidence();
  assert.deepEqual(decodeCandidateArtifactImport(encodeCandidateArtifactImport([original])), [original]);
  assert.equal(decodeCandidateArtifactImport(encodeCandidateArtifactImport([original]))[0].workflow, null);
  assert.throws(() => encodeCandidateArtifactImport([{ status: 'passed', artifact }]), /original Candidate evidence/);
  assert.throws(() => candidateArtifactImportFromEnvironment({ GITHUB_EVENT_NAME: 'pull_request', BUILDR_ARTIFACT_VERIFICATION: encodeCandidateArtifactImport([original]) }), /controlled manual/);
  assert.throws(() => decodeCandidateArtifactImport('a'.repeat(MAX_ARTIFACT_IMPORT_CHARACTERS + 1)), /budget/);
  const corrupt = gzipSync(JSON.stringify({ schemaVersion: 'buildr.candidate-artifact-import/v1', digest: 'changed', evidence: [original] })).toString('base64');
  assert.throws(() => decodeCandidateArtifactImport(corrupt), /integrity/);
});

test('same-package results retain success independently of assertion and dependency fingerprints', () => {
  const original = evidence();
  assert.equal(validateCandidateArtifactEvidence(original, descriptor, context, inputs, artifact), true);
  for (const change of [
    (item: any) => { item.artifact.sha256 = 'e'.repeat(64); },
    (item: any) => { item.results[0].childExitCode = 1; },
    (item: any) => { item.cleanupClean = false; },
  ]) {
    const changed = structuredClone(original); change(changed);
    assert.equal(validateCandidateArtifactEvidence(changed, descriptor, context, inputs, artifact), false);
  }
  assert.equal(validateCandidateArtifactEvidence(evidence(descriptor, 'win32'), descriptor, context, inputs, artifact), false);
  const common = { ...descriptor, platformScope: { kind: 'common', runners: [] } };
  assert.equal(validateCandidateArtifactEvidence(evidence(common, 'win32'), common, context, inputs, artifact), true);
  const wrongDependencyInputs = structuredClone(original);
  wrongDependencyInputs.executionEnvironment.dependencyInputsIdentity = hash('self-consistent-but-wrong-lock');
  const { identity: _oldIdentity, ...wrongBody } = wrongDependencyInputs.executionEnvironment;
  wrongDependencyInputs.executionEnvironment.identity = hash(wrongBody);
  assert.equal(validateCandidateArtifactEvidence(wrongDependencyInputs, descriptor, context, inputs, artifact,
    { dependencyInputsIdentity: original.executionEnvironment.dependencyInputsIdentity }), true);
  const adopted = reusedCandidateArtifactResult(original, 'release-tarball-smoke');
  assert.equal(adopted.reusedFrom.kind, 'local'); assert.equal(adopted.reusedFrom.workflow, null);
  assert.equal(adopted.durationMs, 0); assert.equal(adopted.reusedFrom.durationMs, 100);
  assert.deepEqual(adopted.artifactRecord, original);
});

test('Host Node reuse requires the exact minimum on each actual system', () => {
  for (const runner of ['macos', 'windows']) {
    const host = { id: `host-minimum-${runner}`, kind: 'host-node', runner, requiresArtifact: true,
      requestedNode: '24.15.0', expectation: 'minimum', steps: [{ id: 'host-node-compatibility' }] };
    const platform = runner === 'macos' ? 'darwin' : 'win32';
    const original = evidence(host, platform, '24.15.0');
    assert.equal(validateCandidateArtifactEvidence(original, host, context, original.checkInputs, artifact), true);
    for (const version of ['24.21.0', '24.14.0', '25.0.0']) {
      const changed = evidence(host, platform, version);
      assert.equal(validateCandidateArtifactEvidence(changed, host, context, changed.checkInputs, artifact), false, version);
    }
  }
});

test('failed local groups retain successful children across assertion and dependency edits', () => {
  const group = { ...descriptor, steps: [{ id: 'contract' }, { id: 'payload' }, { id: 'parity' }] };
  const original = evidence(group);
  original.status = 'failed'; original.results[2].status = 'failed'; original.results[2].exitCode = 1;
  const currentInputs = { ...original.checkInputs, parity: hash('corrected parity assertion') };
  const expectedEnvironment = { executionEnvironment: { ...original.executionEnvironment, inputsIdentity: hash(currentInputs) } };
  assert.deepEqual(reusableCandidateArtifactStepIds(original, group, context, currentInputs, artifact, expectedEnvironment), ['contract', 'payload']);
  assert.equal(validateCandidateArtifactEvidence(original, group, context, original.checkInputs, artifact), false,
    'successful children never make the failed group complete');
  const adopted = reusedCandidateArtifactResult(original, 'payload');
  assert.equal(adopted.artifactRecord.status, 'failed');
  assert.equal(adopted.reusedFrom.durationMs, 100);
  assert.equal(adopted.artifactRecord.results[2].status, 'failed');
  const changedInputs = { ...currentInputs, payload: hash('changed payload assertion') };
  assert.deepEqual(reusableCandidateArtifactStepIds(original, group, context, changedInputs, artifact, expectedEnvironment), ['contract', 'payload']);
  for (const change of [
    (item: any) => { item.cleanupClean = false; },
    (item: any) => { item.workflow = { runId: '52', runAttempt: '1' }; },
    (item: any) => { item.artifact.sha256 = 'e'.repeat(64); },
    (item: any) => { item.results.push(item.results[0]); },
  ]) {
    const changed = structuredClone(original); change(changed);
    assert.deepEqual(reusableCandidateArtifactStepIds(changed, group, context, currentInputs, artifact, expectedEnvironment), []);
  }
  const changedEnvironment = { ...original.executionEnvironment, dependencyIdentity: hash('new actual controller') };
  assert.deepEqual(reusableCandidateArtifactStepIds(original, group, context, currentInputs, artifact, { executionEnvironment: changedEnvironment }), ['contract', 'payload']);
});
