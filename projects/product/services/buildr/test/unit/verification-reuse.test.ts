import assert from 'node:assert/strict';
import test from 'node:test';
import { createVerificationReuseIdentity, reusedVerificationResult, validateVerificationReuseRecord,
  type VerificationReuseSnapshot, type VerificationReuseStep, type VerificationReuseRecord } from '../verification/verification-reuse.ts';
import { verificationSteps, verificationStepExecutionInputs } from '../verification/registry.ts';

const sha = `sha256-${'a'.repeat(64)}` as const;
const step: VerificationReuseStep = { id: 'fixture-check', executor: { type: 'node', file: 'check.ts' }, reuse: { scope: 'backend' }, dependsOn: [] };
const snapshot: VerificationReuseSnapshot = { productRoot: '/one/checkout', repositoryRoot: '/one', sourceCommit: 'a'.repeat(40), gitIdentity: sha,
  contentIdentities: { backend: sha, web: sha, product: sha, repository: sha, plugin: sha, runtime: sha },
  environment: { platform: 'darwin', arch: 'arm64', nodeVersion: '24.21.0', tools: { 'backend-dependencies': sha }, variablesIdentity: sha } };
function record(): VerificationReuseRecord {
  const identity = createVerificationReuseIdentity(step, snapshot)!;
  return { schemaVersion: 'buildr.verification-source-result/v1', identity, identityAfter: identity.key, cleanup: 'clean', environment: snapshot.environment,
    origin: { kind: 'local', runId: 'source-fixture-1', sourceCommit: snapshot.sourceCommit, startedAt: '2026-10-15T00:00:00.000Z', finishedAt: '2026-10-15T00:00:01.000Z' },
    result: { id: step.id, status: 'passed', exitCode: 0, durationMs: 1000, childOutcome: 'passed', childExitCode: 0, childSignal: null } };
}
test('source identity binds content and check recipe while commit and checkout location are provenance', () => {
  const identity = createVerificationReuseIdentity(step, snapshot);
  assert.deepEqual(createVerificationReuseIdentity(step, { ...snapshot, sourceCommit: 'b'.repeat(40), productRoot: '/another/checkout', repositoryRoot: '/another' }), identity);
  assert.notDeepEqual(createVerificationReuseIdentity({ ...step, executor: { ...step.executor, args: ['--changed'] } }, snapshot), identity);
  assert.notDeepEqual(createVerificationReuseIdentity({ ...step, dependsOn: ['real-input-producer'] }, snapshot), identity);
  assert.notDeepEqual(createVerificationReuseIdentity(step, { ...snapshot, contentIdentities: { ...snapshot.contentIdentities, backend: `sha256-${'b'.repeat(64)}` } }), identity);
  assert.equal(createVerificationReuseIdentity({ ...step, executor: { type: 'candidate-artifact' } }, snapshot), null);
  assert.equal(createVerificationReuseIdentity({ ...step, executor: { type: 'node', consumesArtifact: true } }, snapshot), null);
});

test('execution inputs bind only the selected check inner workers, not queue capacities or unrelated checks', () => {
  const selected = { ...step, resourceDemand: { workers: 2, processes: 2 } };
  const profile = { local: { global: 4, classes: { default: 4 }, capacities: { workers: 8 }, innerConcurrency: { [step.id]: 3, other: 4 } } };
  const before = verificationStepExecutionInputs(selected, profile);
  assert.deepEqual(before, { innerWorkers: { local: 3 } });
  assert.deepEqual(verificationStepExecutionInputs(selected, { local: { ...profile.local, global: 8, classes: {}, capacities: {}, innerConcurrency: { [step.id]: 3, other: 8 } } }), before);
  assert.notDeepEqual(verificationStepExecutionInputs(selected, { local: { ...profile.local, innerConcurrency: { [step.id]: 4 } } }), before);
  assert.deepEqual(verificationStepExecutionInputs(selected, { local: { innerConcurrency: {} } }), { innerWorkers: { local: 2 } });
  for (const type of ['npm', 'package-selector', 'workspace-suite']) assert.equal(verificationStepExecutionInputs({ ...selected, executor: { type } }, profile), null, type);
});

test('unit proofs include the actual Web dependencies consumed by imported helpers', () => {
  const unit = verificationSteps.find((item: VerificationReuseStep) => item.id === 'unit');
  const complete = { ...snapshot, environment: { ...snapshot.environment, tools: { ...snapshot.environment.tools, 'web-dependencies': sha } } };
  const before = createVerificationReuseIdentity(unit, complete);
  assert.ok(before);
  assert.notDeepEqual(createVerificationReuseIdentity(unit, { ...complete, environment: { ...complete.environment,
    tools: { ...complete.environment.tools, 'web-dependencies': `sha256-${'b'.repeat(64)}` } } }), before);
});
test('Git-sensitive and exact-tool checks bind necessary facts without a global HEAD expiry', () => {
  const changed = { ...snapshot, gitIdentity: `sha256-${'b'.repeat(64)}` as const };
  assert.deepEqual(createVerificationReuseIdentity(step, changed), createVerificationReuseIdentity(step, snapshot));
  const gitStep = { ...step, reuse: { scope: 'backend' as const, git: true } };
  assert.notDeepEqual(createVerificationReuseIdentity(gitStep, changed), createVerificationReuseIdentity(gitStep, snapshot));
  assert.equal(createVerificationReuseIdentity({ ...step, reuse: { scope: 'backend', tools: ['sdk'] } }, snapshot), null);
  assert.equal(createVerificationReuseIdentity(step, { ...snapshot, unavailableScopes: ['backend'] }), null);
});
test('comparison proofs bind the resolved base and HEAD while isolated Git fixtures ignore retained refs', () => {
  const comparison = { head: 'a'.repeat(40), baseRef: 'origin/dev', base: 'b'.repeat(40), mergeBase: 'c'.repeat(40) };
  const selected: VerificationReuseStep = { ...step, reuse: { scope: 'backend', git: 'comparison' } };
  const current = { ...snapshot, gitComparison: comparison };
  const identity = createVerificationReuseIdentity(selected, current);
  assert.ok(identity);
  assert.equal(createVerificationReuseIdentity(selected, snapshot), null);
  assert.deepEqual(createVerificationReuseIdentity(selected, { ...current, gitIdentity: `sha256-${'b'.repeat(64)}` }), identity);
  for (const field of ['head', 'base', 'mergeBase']) {
    assert.notDeepEqual(createVerificationReuseIdentity(selected, { ...current, gitComparison: { ...comparison, [field]: 'd'.repeat(40) } }), identity, field);
  }
  const complete = { ...snapshot, environment: { ...snapshot.environment, tools: { ...snapshot.environment.tools, 'web-dependencies': sha, git: '2.50.1' } } };
  for (const id of ['integration-self-bootstrap', 'service-branch-contract']) {
    const fixture = verificationSteps.find((item: VerificationReuseStep) => item.id === id);
    const original = createVerificationReuseIdentity(fixture, complete);
    assert.ok(original, id);
    assert.equal('gitIdentity' in original, false, id);
    assert.deepEqual(createVerificationReuseIdentity(fixture, { ...complete, gitIdentity: `sha256-${'b'.repeat(64)}` }), original, id);
  }
});
test('portable checks use the recorded runner and stable supported Node family, never the checker platform', () => {
  const value = record();
  const ubuntu = { ...snapshot, environment: { ...snapshot.environment, platform: 'linux', arch: 'x64', nodeVersion: '24.15.0' } };
  assert.equal(validateVerificationReuseRecord(value, { productRoot: '/unused', step, snapshot: ubuntu, runner: 'macos' }), true);
  assert.equal(validateVerificationReuseRecord(value, { productRoot: '/unused', step, snapshot: ubuntu, runner: 'windows' }), false);
  assert.equal(validateVerificationReuseRecord(value, { productRoot: '/unused', step, snapshot: ubuntu, arch: 'x64' }), false);
  const newer = { ...value, environment: { ...value.environment, nodeVersion: '26.0.0' } };
  assert.equal(validateVerificationReuseRecord(newer, { productRoot: '/unused', step, snapshot }), true);
  for (const nodeVersion of ['24.14.9', '24.15.0-rc.1', '024.15.0', 'invalid']) {
    assert.equal(validateVerificationReuseRecord({ ...value, environment: { ...value.environment, nodeVersion } }, { productRoot: '/unused', step, snapshot }), false, nodeVersion);
  }
});
test('incomplete atomic exit, cleanup drift and unbounded portable fields cannot become a passed proof', () => {
  const value = record(), options = { productRoot: '/unused', step, snapshot };
  assert.equal(validateVerificationReuseRecord(value, options), true);
  for (const invalid of [
    { ...value, cleanup: 'failed' }, { ...value, identityAfter: sha },
    { ...value, result: { ...value.result, childOutcome: 'unknown' } },
    { ...value, result: { ...value.result, childExitCode: 1 } },
    { ...value, result: { ...value.result, childSignal: 'SIGTERM' } },
    { ...value, stdout: '/private/secret' }, { ...value, origin: { ...value.origin, runId: '/private/checkout' } },
  ]) assert.equal(validateVerificationReuseRecord(invalid, options), false);
  const result = reusedVerificationResult(value);
  assert.equal(result.durationMs, 0);
  assert.equal(result.reusedFrom.durationMs, 1000);
  assert.equal(result.disposition, 'reused');
  assert.equal(result.sourceRecord, value);
  assert.equal('process' in result, false);
  assert.equal(result.stdout, '');
});

test('source package selectors and isolated launcher checks are reusable while final package production and consumption never are', () => {
  const selectors = verificationSteps.filter((item: VerificationReuseStep) => item.executor.type === 'package-selector');
  assert.deepEqual(selectors.map((item: VerificationReuseStep) => item.id).sort(), ['package-commands', 'package-rules', 'package-runtime', 'package-skills', 'package-static', 'package-workspace']);
  const complete = { ...snapshot, environment: { ...snapshot.environment, tools: { ...snapshot.environment.tools, 'web-dependencies': sha, git: '2.50.1' } } };
  for (const selected of selectors) {
    assert.ok(selected.reuse, selected.id);
    const original = createVerificationReuseIdentity(selected, complete);
    assert.ok(original, selected.id);
    assert.notEqual(createVerificationReuseIdentity({ ...selected, executor: { ...selected.executor, selector: 'different-source-check' } }, complete)?.key, original.key);
  }
  const launcher = verificationSteps.find((item: VerificationReuseStep) => item.id === 'npm-launcher-candidate');
  assert.ok(launcher.reuse);
  assert.ok(createVerificationReuseIdentity(launcher, complete));
  for (const selected of verificationSteps.filter((item: VerificationReuseStep) => item.executor.type === 'candidate-artifact' || item.executor.consumesArtifact)) {
    assert.equal(selected.reuse, false, selected.id);
    assert.equal(createVerificationReuseIdentity({ ...selected, reuse: { scope: 'backend' } }, complete), null, selected.id);
  }
});

test('only reviewed fixture runtime checks exclude Product governance material while governance owners retain it', () => {
  const ids = ['integration-runtime', 'integration-data-store', 'integration-task-read-models', 'integration-task-coordination',
    'integration-project-daily-progress', 'system-buildr-web-http', 'system-task-lifecycle', 'system-worktree-lifecycle', 'system-nested-git-isolation',
    'integration-candidate-release-effects', 'integration-candidate-git-convergence', 'integration-candidate-git-selection',
    'system-runtime-recovery', 'system-app-process', 'system-workspace-lifecycle', 'system-windows-platform'];
  assert.deepEqual(verificationSteps.filter((item: VerificationReuseStep) => item.reuse && item.reuse.scope === 'runtime').map((item: VerificationReuseStep) => item.id).sort(), ids.sort());
  for (const id of ['docs-quality', 'openspec-strict', 'openspec-candidate-audit', 'contract', 'integration-verification']) {
    assert.equal(verificationSteps.find((item: VerificationReuseStep) => item.id === id).reuse.scope, 'repository', id);
  }
  assert.equal(verificationSteps.find((item: VerificationReuseStep) => item.id === 'openspec-candidate-audit').reuse.git, 'comparison');
  const runtime = verificationSteps.find((item: VerificationReuseStep) => item.id === 'integration-runtime');
  const complete = { ...snapshot, stepInputs: { [runtime.id]: { contentIdentity: sha, recipeIdentity: sha, fallback: false, unavailable: false } },
    environment: { ...snapshot.environment, tools: { ...snapshot.environment.tools, 'web-dependencies': sha, git: '2.50.1' } } };
  const identity = createVerificationReuseIdentity(runtime, complete);
  assert.ok(identity);
  assert.notEqual(createVerificationReuseIdentity({ ...runtime, executor: { ...runtime.executor, args: ['--different-recipe'] } }, complete)?.key, identity.key);
  assert.notEqual(createVerificationReuseIdentity(runtime, { ...complete, stepInputs: { [runtime.id]: { ...complete.stepInputs[runtime.id], contentIdentity: `sha256-${'b'.repeat(64)}` } } })?.key, identity.key);
  assert.equal(createVerificationReuseIdentity(runtime, { ...complete, stepInputs: undefined }), null);
});

test('declared semantic inputs distinguish subsets and bases without changing unrelated check identities', () => {
  const names = ['BUILDR_CHANGED_PATHS_JSON', 'BUILDR_VERIFICATION_BASE'];
  const scoped: VerificationReuseStep = { ...step, reuse: { scope: 'backend', inputs: names } };
  const inputs = { ...snapshot, inputIdentities: { BUILDR_CHANGED_PATHS_JSON: sha, BUILDR_VERIFICATION_BASE: sha } };
  const identity = createVerificationReuseIdentity(scoped, inputs);
  assert.ok(identity);
  assert.equal(createVerificationReuseIdentity(scoped, snapshot), null, 'missing declared input summaries cannot imply full coverage');
  for (const name of names) {
    const changed = { ...inputs, inputIdentities: { ...inputs.inputIdentities, [name]: `sha256-${'b'.repeat(64)}` } };
    assert.notEqual(createVerificationReuseIdentity(scoped, changed)?.key, identity.key, name);
    assert.deepEqual(createVerificationReuseIdentity(step, changed), createVerificationReuseIdentity(step, snapshot));
  }
  const unrelated = createVerificationReuseIdentity(step, inputs);
  assert.ok(unrelated); assert.equal('inputIdentity' in unrelated, false);
  const value = { ...record(), identity, identityAfter: identity.key };
  const checker = { ...inputs, environment: { ...inputs.environment, platform: 'linux', arch: 'x64' } };
  assert.equal(validateVerificationReuseRecord(value, { productRoot: '/unused', step: scoped, snapshot: checker, runner: 'macos' }), true);
  assert.equal(validateVerificationReuseRecord(value, { productRoot: '/unused', step: scoped,
    snapshot: { ...checker, inputIdentities: { ...inputs.inputIdentities, BUILDR_CHANGED_PATHS_JSON: `sha256-${'c'.repeat(64)}` } }, runner: 'macos' }), false);
});

test('only the observed semantic input consumers declare selectors; artifact browser checks remain non-reusable', () => {
  const inputs = Object.fromEntries(verificationSteps.flatMap((item: VerificationReuseStep) => item.reuse && item.reuse.inputs ? [[item.id, item.reuse.inputs]] : []));
  assert.deepEqual(inputs, { 'openspec-candidate-audit': ['BUILDR_VERIFICATION_BASE'], 'runtime-skill-projection': ['BUILDR_CHANGED_PATHS_JSON'], 'docs-quality': ['BUILDR_CHANGED_PATHS_JSON'] });
  assert.equal(verificationSteps.find((item: VerificationReuseStep) => item.id === 'artifact-browser-core').reuse, false);
});
