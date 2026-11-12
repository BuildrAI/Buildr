import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceChangeEvidence } from '../verification/source-diff.ts';
import { createVerificationPlan, budgetRelatedVerificationPlan } from '../verification/planner.ts';
import { semanticTagsForPaths } from '../verification/semantic-tags.ts';
import { selectBrowserSelectors } from '../verification/browser-selector-dispatcher.ts';

const file = 'services/buildr-agent/src/index.ts';
const before = "export { prepare, validate } from './runtime.ts';\n";
const after = "export { prepare, validate, digest } from './runtime.ts';\n";
const ids = (plan: any): string[] => plan.steps.map((step: any) => step.id);
const plan = (paths = [file], contentChanges = [sourceChangeEvidence(file, before, after)], extra = {}) =>
  createVerificationPlan({ paths, contentChanges, related: true, semantic: true, target: 'source', ...extra });

const budgetStep = (id: string, cost: number | undefined = 1, boundary = 'Integration', extra = {}) => ({
  id, schedulingCostMs: cost, testing: { executionBoundary: boundary }, dependsOn: [],
  reasons: ['src/shared.ts matches src/**'], ...extra,
});
const budgetPlan = (steps: any[]) => ({ steps, gaps: [{ code: 'unmapped-source' }], scope: { mode: 'full' } });

test('daily budget includes at most ten checks, prefers short peers and discloses every deferred candidate', () => {
  const input = budgetPlan(Array.from({ length: 16 }, (_, i) => budgetStep(`check-${i}`, i + 1)));
  const result = budgetRelatedVerificationPlan(input, { mode: 'related' });
  assert.equal(result.steps.length, 10);
  assert.deepEqual(ids(result), input.steps.slice(0, 10).map(step => step.id));
  assert.equal(result.selectionBudget.deferred.length, 6);
  assert.equal(result.selectionBudget.proofScope, 'targeted');
  assert.equal(result.selectionBudget.fullCoverage, false);
  assert.equal(result.gaps, input.gaps);
  assert.equal(input.steps.length, 16);
});

test('changed tests and foundational checks outrank short indirect journeys; unknown cost is not zero', () => {
  const steps = [
    ...Array.from({ length: 10 }, (_, i) => budgetStep(`indirect-${i}`, 1, 'E2E', { reasons: ['semantic tag recovery'] })),
    budgetStep('direct-long', 10000),
    budgetStep('changed-test', 20000, 'Integration', { reasons: ['test/integration/feature.test.ts matches test/integration/feature.test.ts'] }),
    budgetStep('types', 30000, 'Static'),
    budgetStep('unknown', undefined),
    budgetStep('zero-is-unknown', 0),
  ];
  const result = budgetRelatedVerificationPlan(budgetPlan(steps), { mode: 'related' });
  for (const id of ['changed-test', 'types', 'direct-long', 'unknown', 'zero-is-unknown']) assert.ok(ids(result).includes(id), id);
  // Within the same relevance tier, measured short checks precede missing costs.
  const peers = budgetRelatedVerificationPlan(budgetPlan([
    budgetStep('unknown', undefined, 'Integration', { schedulingCostMs: undefined }),
    ...Array.from({ length: 10 }, (_, i) => budgetStep(`short-${i}`, 100)),
  ]), { mode: 'related' });
  assert.ok(!ids(peers).includes('unknown'));
  assert.equal(peers.selectionBudget.deferred[0].estimatedDurationMs, null);
});

test('dependency closures consume budget, remain ordered, and oversized closures are deferred intact', () => {
  const deps = Array.from({ length: 10 }, (_, i) => budgetStep(`dep-${i}`, 100));
  const root = budgetStep('root', 1, 'Integration', { dependsOn: deps.map(step => step.id) });
  const result = budgetRelatedVerificationPlan(budgetPlan([...deps, root]), { mode: 'related' });
  assert.equal(result.steps.length, 10);
  assert.ok(!ids(result).includes('root'));
  const paired = budgetRelatedVerificationPlan(budgetPlan([
    budgetStep('prerequisite', 99999), budgetStep('dependent', 1, 'Integration', { dependsOn: ['prerequisite'] }),
  ]), { mode: 'related' });
  assert.deepEqual(ids(paired), ['prerequisite', 'dependent']);
  assert.equal(paired.selectionBudget.selectedCount, 2);
});

test('shared test harness does not promote all journeys; direct behavior gets a small sample beside foundations', () => {
  const steps = [
    ...Array.from({ length: 12 }, (_, i) => budgetStep(`foundation-${i}`, undefined, 'Static')),
    ...Array.from({ length: 12 }, (_, i) => budgetStep(`journey-${i}`, i + 1, 'E2E', {
      reasons: ['test/e2e/shared.test.ts matches test/e2e/shared.test.ts'],
    })),
  ];
  const result = budgetRelatedVerificationPlan(budgetPlan(steps), { mode: 'related' });
  assert.equal(result.steps.length, 10);
  assert.deepEqual(result.steps.filter((step: any) => step.testing.executionBoundary === 'E2E').map((step: any) => step.id), ['journey-0', 'journey-1']);
  assert.equal(result.steps.filter((step: any) => step.testing.executionBoundary === 'Static').length, 8);
});

test('explicit checks, tags, repair and full modes never silently truncate; small automatic plans do not fill slots', () => {
  const input = budgetPlan(Array.from({ length: 15 }, (_, i) => budgetStep(`check-${i}`)));
  for (const request of [
    { mode: 'check' }, { mode: 'integration' }, { mode: 'e2e' },
    { mode: 'related', checks: ['check-0'] }, { mode: 'related', tags: ['recovery'] },
    { mode: 'related', failedFrom: 'evidence.json' },
  ]) assert.equal(budgetRelatedVerificationPlan(input, request), input);
  assert.equal(budgetRelatedVerificationPlan(budgetPlan([budgetStep('one')]), { mode: 'related' }).steps.length, 1);
  assert.equal(budgetRelatedVerificationPlan(budgetPlan([]), { mode: 'related' }).steps.length, 0);
});

test('additive existing-module export retains public checks but not behavior journeys', () => {
  const result = plan();
  assert.deepEqual(ids(result).sort(), ['agent-source-boundaries', 'agent-typecheck', 'agent-unit', 'generated-contracts'].sort());
  assert.equal(result.refinements[0].kind, 'additive-exports');
  assert.ok(result.refinements[0].skippedOwnerIds.includes('agent-integration-recovery'));
  assert.deepEqual(result.gaps, []);
});

test('existing module import order and old public bindings must remain unchanged', () => {
  for (const current of [
    "export { digest } from './new-module.ts';\n" + before,
    "export { prepare as renamed, validate, digest } from './runtime.ts';\n",
    "export { prepare, digest } from './runtime.ts';\n",
    after + 'startNewExecution();\n',
    "export * from './runtime.ts';\n",
    "export { prepare, validate, digest } from './runtime.ts' with { type: 'json' };\n",
    "export { prepare, validate, ",
  ]) assert.equal(sourceChangeEvidence(file, before, current), null, current);
  const two = before + "export { b } from './b.ts';\n";
  assert.equal(sourceChangeEvidence(file, two, "export { b } from './b.ts';\n" + after), null);
  assert.ok(sourceChangeEvidence(file, before, before + "export { digest } from './runtime.ts';\n"));
});

test('star export collisions, new current collisions and opaque barrels stay conservative', () => {
  const previous = "export * from './contracts.ts';\n" + before;
  const current = "export * from './contracts.ts';\n" + after;
  assert.equal(sourceChangeEvidence(file, previous, current), null);
  assert.equal(sourceChangeEvidence(file, previous, current, () => 'export const digest = 1;'), null);
  assert.equal(sourceChangeEvidence(file, previous, current, (_specifier, version) =>
    version === 'before' ? 'export const other = 1;' : 'export const digest = 1;'), null);
  assert.ok(sourceChangeEvidence(file, previous, current, specifier => specifier === './contracts.ts'
    ? "export * from './nested.ts';" : 'export interface Contract {}'));
  assert.equal(sourceChangeEvidence(file, previous, current, () => "export * from './contracts.ts';"), null);
});

test('ASI-sensitive statements and mixed erased types are not mistaken for additive changes', () => {
  const previous = before + 'function f() { return\n42; }\n';
  assert.equal(sourceChangeEvidence(file, previous, after + 'function f() { return 42; }\n'), null);
  assert.equal(sourceChangeEvidence(file, "export { type Contract, prepare } from './runtime.ts';",
    "export { type Changed, prepare, digest } from './runtime.ts';"), null);
});

test('byte identity is proved, arbitrary function extraction and digest algorithm changes are not', () => {
  assert.equal(sourceChangeEvidence(file, before, before)?.kind, 'byte-identical');
  assert.equal(sourceChangeEvidence('runtime-unit.ts', 'const digest = hash(bytes);',
    'function compute() { return hash(bytes); } const digest = compute();'), null);
  assert.equal(sourceChangeEvidence('runtime-unit.ts', "hash('sha256')", "hash('sha512')"), null);
  const result = plan(['services/buildr-agent/src/process/runtime-unit.ts'], []);
  for (const id of ['agent-integration', 'integration-agent-host',
    'agent-integration-startup', 'agent-integration-handoff', 'agent-integration-recovery', 'agent-integration-recovery-budget']) {
    assert.ok(ids(result).includes(id), id);
  }
  assert.ok(!ids(result).includes('agent-integration-native'));
  assert.ok(!ids(result).includes('agent-integration-conversations'));
});

test('provider-local behavior selects protocol consumers, while shared and unknown sources stay broad', () => {
  const local = ids(plan(['services/buildr-agent/src/executors/qoder-cn/forms.ts'], []));
  for (const id of ['agent-integration', 'agent-integration-native', 'agent-integration-conversations', 'integration-agent-host']) {
    assert.ok(local.includes(id), id);
  }
  assert.ok(!local.some(id => /^agent-integration-(startup|handoff|recovery)/u.test(id)));
  assert.ok(!local.includes('integration'), 'tool orchestration is not a host behavior owner');
  assert.ok(!local.includes('repository-onboarding'), 'ordinary behavior does not change checkout preparation');
  const hinted = ids(plan(['services/buildr-agent/src/executors/qoder/handoff.ts'], []));
  assert.ok(!hinted.some(id => /^agent-integration-(startup|handoff|recovery)/u.test(id)), 'name hints cannot override unaffected fixture domains');
  assert.ok(ids(plan(['services/buildr-agent/src/executors/qoder/handoff.ts'], [], { tags: ['handoff'] })).includes('agent-integration-handoff'));
  for (const path of ['services/buildr-agent/src/future/unknown.ts', 'services/buildr-agent/src/contracts.ts']) {
    const broad = ids(plan([path], []));
    for (const id of ['agent-integration-native', 'agent-integration-startup', 'agent-integration-handoff', 'agent-integration-recovery']) {
      assert.ok(broad.includes(id), `${path}: ${id}`);
    }
  }
});

test('Agent test members keep their own owner and preparation changes retain onboarding', () => {
  const result = ids(plan(['services/buildr-agent/test/integration/executors/qoder-cn.test.ts'], []));
  assert.ok(result.includes('agent-integration-native'));
  assert.ok(!result.includes('integration-agent-host'));
  assert.ok(!result.includes('repository-onboarding'));
  assert.ok(ids(plan(['services/buildr-agent/package.json'], [])).includes('repository-onboarding'));
  assert.ok(ids(plan(['services/buildr-agent/tools/build.ts'], [])).includes('repository-onboarding'));
});

test('explicit tags, full requests, and other changed paths cannot be canceled by a local proof', () => {
  assert.ok(ids(plan([file], undefined, { tags: ['handoff'] })).includes('agent-integration-handoff'));
  assert.ok(ids(plan([file], undefined, { profiles: ['candidate'] })).includes('agent-integration-recovery'));
  assert.ok(ids(plan([file, 'services/buildr-agent/src/process/runtime-unit.ts'])).includes('agent-integration-recovery'));
  assert.ok(ids(plan([file], [])).includes('agent-integration-native'), 'path-only inputs remain conservative');
});

test('documentation names do not infer behavior; implementation and explicit tags still do', () => {
  for (const path of ['knowledge/docs/architecture/agent-integration.md', 'knowledge/handoff.md', 'openspec/changes/recovery/tasks.md',
    'resources/workspace/skills/buildr/project-verification/references/impact-selection.md', 'tools/recovery/README.md']) {
    assert.deepEqual(semanticTagsForPaths([path]), []);
    assert.ok(!ids(plan([path], [])).some(id => id.startsWith('agent-integration')), path);
  }
  assert.ok(semanticTagsForPaths(['services/buildr-agent/src/application/conversation-application.ts']).includes('conversation'));
  assert.ok(semanticTagsForPaths(['resources/workspace/skills/example/scripts/recovery.mjs']).includes('recovery'));
  assert.ok(ids(plan(['knowledge/handoff.md'], [], { tags: ['handoff'] })).includes('agent-integration-handoff'));
});

test('independent CLI E2E members keep their owner without all browser journeys', () => {
  for (const path of ['test/e2e/task-commits.test.ts', 'test/e2e/workspace-runtime-recovery.test.ts']) {
    assert.deepEqual(selectBrowserSelectors([path]).selectors, []);
    const result = plan([path], []);
    assert.ok(ids(result).some(id => id.startsWith('e2e-')), path);
    assert.ok(!ids(result).some(id => id.startsWith('e2e-browser:')), path);
    assert.deepEqual(result.gaps, []);
  }
  assert.deepEqual(selectBrowserSelectors(['test/e2e/buildr-web-browser.test.ts']).selectors, ['all']);
});

test('ownership data changes verify contracts instead of every business row', () => {
  for (const path of ['test/verification/ownership/development.ts', 'test/verification/ownership/runtime.ts',
    'test/verification/browser-selector-dispatcher.ts', 'test/verification/browser-selector-catalog.ts']) {
    const result = ids(plan([path], []));
    for (const id of ['unit', 'test-syntax', 'test-typecheck', 'integration-changed-paths', 'integration-verification-runtime']) {
      assert.ok(result.includes(id), `${path}: ${id}`);
    }
    assert.ok(!result.some(id => id.startsWith('e2e-browser:')), path);
    assert.ok(!result.includes('e2e-task'), path);
  }
});

test('mixed plans attribute browser ownership only to the path that caused it', () => {
  const doc = 'knowledge/docs/architecture/agent-integration.md';
  const source = 'services/buildr-web/src/features/task/pages/TaskDetailPage.tsx';
  const result = plan([doc, source], []);
  const browser = result.steps.find((step: any) => step.id === 'e2e-browser:task');
  assert.ok(browser);
  assert.ok(browser.reasons.some((reason: string) => reason.startsWith(source)));
  assert.ok(!browser.reasons.some((reason: string) => reason.startsWith(doc)));
  const mapping = result.scope.reasons.find((reason: any) => reason.path === doc);
  assert.ok(!mapping.owners.some((id: string) => id.startsWith('e2e-browser:')));
});

test('only inert source ownership metadata can refine service verification declarations', () => {
  const path = 'services/buildr-agent/tools/testing/verification-checks.ts';
  const previous = "export const checks = [{ id: 'native', sourcePaths: ['src/**'], testFiles: ['native.test.ts'], command: {file: 'node'} }];";
  const current = previous.replace("['src/**']", "['src/executors/**']");
  const evidence = sourceChangeEvidence(path, previous, current);
  assert.equal(evidence?.kind, 'verification-metadata');
  const result = ids(plan([path], [evidence]));
  assert.ok(result.includes('integration-changed-paths'));
  assert.ok(result.includes('integration-verification-runtime'));
  assert.ok(!result.some(id => id.startsWith('agent-integration')));
  assert.ok(!result.includes('integration-agent-host'));
  assert.ok(!result.includes('repository-onboarding'));
  for (const changed of [
    previous.replace('native.test.ts', 'other.test.ts'),
    previous.replace("file: 'node'", "file: 'other'"),
    previous.replace("['src/**']", 'runSideEffect()'),
    previous.replace("['src/**']", "['src/**'], timeoutMs: 1"),
  ]) assert.equal(sourceChangeEvidence(path, previous, changed), null, changed);
  const unknown = ids(plan([path], []));
  assert.ok(unknown.includes('agent-integration-recovery'), 'recipe or unknown declaration changes remain broad');
});
