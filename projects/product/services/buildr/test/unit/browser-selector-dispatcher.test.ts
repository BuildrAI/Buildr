import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { BROWSER_SELECTORS, parseChangedPaths, planBrowserCommands, planCodeBrowserGroups, selectBrowserSelectors } from '../verification/browser-selector-dispatcher.ts';
import { createVerificationPlan } from '../verification/planner.ts';

test('Task-owned materials select the existing production-host browser boundary', () => {
  const plan = selectBrowserSelectors(['services/buildr/src/modules/task/materials/application/task-materials-application.ts']);
  assert.equal(plan.status, 'selected');
  assert.deepEqual(plan.selectors, ['task-materials']);
});

test('Browser dispatcher skips Chrome for HTTP-only Buildr Web changes', () => {
  const plan: any = selectBrowserSelectors(['src/web/http/server.ts']);
  assert.equal(plan.status, 'not-applicable');
  assert.deepEqual(plan.selectors, []);
  assert.match(plan.reasons[0].reason, /HTTP\/API owner/);
});

test('complete Harness webpage and Development embedded frame each have their own browser owner', () => {
  const standalone = selectBrowserSelectors(['services/buildr-harness-web/src/HarnessApp.tsx']);
  assert.deepEqual(standalone.selectors, []);
  assert.ok(standalone.reasons.some((value: { reason: string }) => value.reason.includes('完整 Harness 网页')));
  const frame = selectBrowserSelectors(['services/buildr-web/src/features/harness-ui/ConversationWorkspace.tsx']);
  assert.deepEqual(frame.selectors, []);
  assert.equal(frame.status, 'not-applicable');
  assert.ok(frame.reasons.some((value: { reason: string }) => value.reason.includes('harness-frame-browser')));
});

test('Browser dispatcher selects only affected resource selectors', () => {
  const plan: any = selectBrowserSelectors([
    'services/buildr-web/src/features/task/pages/TaskDetailPage.tsx',
    'services/buildr-web/src/features/project/pages/ProjectDetailPage.tsx',
  ]);
  assert.equal(plan.status, 'selected');
  assert.deepEqual(plan.selectors, ['task', 'task-materials', 'project']);
  assert.equal(plan.reasons.length, 3);
});

test('Browser dispatcher covers workbench pages and shared preference interactions', () => {
  for (const file of ['pages/WorkbenchPage.tsx', 'hooks/useWorkbench.ts', 'api/workbench-api.ts']) {
    const plan = selectBrowserSelectors([`services/buildr-web/src/features/workbench/${file}`]);
    assert.equal(plan.status, 'selected');
    assert.deepEqual(plan.selectors, ['workbench']);
  }
});

test('Browser dispatcher closes the old zero-selector success for Web package and build config', () => {
  for (const input of [
    'services/buildr-web/package.json',
    'services/buildr-web/package-lock.json',
    'services/buildr-web/vite.config.ts',
    'services/buildr-web/tsconfig.json',
  ]) {
    const plan: any = selectBrowserSelectors([input]);
    assert.equal(plan.status, 'selected', input);
    assert.equal(plan.mode, 'full', input);
    assert.deepEqual(plan.selectors, ['all'], input);
  }
});

test('Browser dispatcher accepts Project-relative Buildr paths', () => {
  const plan: any = selectBrowserSelectors(['services/buildr/src/web/application/preview-lifecycle.ts']);
  assert.equal(plan.status, 'selected');
  assert.deepEqual(plan.selectors, ['shell', 'core']);
});

test('Browser dispatcher uses core fallback for unknown web paths and shared router', () => {
  const unknown: any = selectBrowserSelectors(['services/buildr-web/src/pages/SettingsPage.tsx']);
  assert.deepEqual(unknown.selectors, ['core']);
  const router: any = selectBrowserSelectors(['services/buildr-web/src/App.tsx']);
  assert.deepEqual(router.selectors, ['shell', 'core']);
});

test('Browser E2E and selection mechanism changes choose explicit full selector set', () => {
  assert.deepEqual(selectBrowserSelectors(['test/e2e/buildr-web-browser.test.ts']).selectors, ['all']);
  assert.deepEqual(selectBrowserSelectors(['test/verification/registry.ts']).selectors, ['all']);
});

test('Browser dispatcher accepts explicit input and falls back to Git changed paths', () => {
  const explicit: any = parseChangedPaths(JSON.stringify(['services/buildr-web/src/App.tsx']));
  assert.deepEqual(explicit, ['services/buildr-web/src/App.tsx']);
  const derived: any = parseChangedPaths(null);
  assert.ok(Array.isArray(derived));
  assert.ok(derived.every((value: any) => typeof value === 'string' && value.length > 0));
});

test('Browser dispatcher rejects malformed or unresolvable changed path input', () => {
  assert.throws(() => parseChangedPaths('{bad'), (error: any) => error.code === 'browser_changed_paths_invalid');
  assert.throws(() => parseChangedPaths('{"paths": [3]}'), (error: any) => error.code === 'browser_changed_paths_invalid');
  const previousBase: any = process.env.BUILDR_VERIFICATION_BASE;
  const previousPaths: any = process.env.BUILDR_CHANGED_PATHS_JSON;
  try {
    delete process.env.BUILDR_CHANGED_PATHS_JSON;
    process.env.BUILDR_VERIFICATION_BASE = '__missing-verification-base__';
    assert.throws(() => parseChangedPaths(), (error: any) => error.code === 'browser_changed_paths_unresolvable');
  } finally {
    if (previousBase === undefined) delete process.env.BUILDR_VERIFICATION_BASE;
    else process.env.BUILDR_VERIFICATION_BASE = previousBase;
    if (previousPaths === undefined) delete process.env.BUILDR_CHANGED_PATHS_JSON;
    else process.env.BUILDR_CHANGED_PATHS_JSON = previousPaths;
  }
});

test('changed planner gives Buildr Web Runtime HTTP its narrow System owner', () => {
  const plan: any = createVerificationPlan({ paths: ['src/web/http/server.ts'] });
  const ids: any = plan.steps.map((step: any) => step.id);
  assert.ok(ids.includes('integration-web-http'));
  assert.equal(ids.includes('system'), false);
});

test('Browser dispatcher covers shared reading and publication components', () => {
  assert.deepEqual(selectBrowserSelectors(['services/buildr-web/src/features/publication/components/ArticleEditorPanel.tsx']).selectors, ['shell', 'articles']);
  assert.deepEqual(selectBrowserSelectors(['services/buildr-web/src/features/knowledge/components/KnowledgeBrowser.tsx']).selectors, ['shell', 'project', 'service', 'articles']);
  for (const file of ['app/WorkspacePages.tsx', 'app/WorkspacePaneHost.tsx', 'components/WorkspaceStage.tsx']) {
    assert.deepEqual(selectBrowserSelectors([`services/buildr-web/src/${file}`]).selectors, ['shell', 'workbench', 'project', 'service', 'articles', 'task', 'task-materials']);
  }
});

test('shared styles and frontend browser scenarios select executable shell or full coverage', () => {
  for (const file of ['styles.css', 'theme.ts', 'components/workspace-stage.css']) {
    assert.ok(selectBrowserSelectors([`services/buildr-web/src/${file}`]).selectors.includes('shell'));
  }
  assert.deepEqual(selectBrowserSelectors(['services/buildr-web/test/browser/task-list-journey.ts']).selectors, ['all']);
});

test('Explorer and SCM are independent explicit checks sharing only the immutable frontend', () => {
  const root = '/tmp/buildr-browser-contract/web-dist';
  const explorer = planBrowserCommands(['code-explorer'], root, {});
  const scm = planBrowserCommands(['code'], root, {});
  assert.deepEqual(explorer.map(item => item.id), ['browser:code-explorer:explorer']);
  assert.deepEqual(scm.map(item => item.id), ['browser:code:source-control']);
  assert.deepEqual(planCodeBrowserGroups({}).map(item => item.id), ['source-control']);
  assert.equal(explorer[0].env.BUILDR_CODE_EXPLORER_FOCUS, 'all');
  assert.equal(explorer[0].env.BUILDR_SOURCE_CONTROL_FOCUS, '');
  assert.equal(scm[0].env.BUILDR_SOURCE_CONTROL_FOCUS, 'all');
  assert.equal(scm[0].env.BUILDR_CODE_EXPLORER_FOCUS, '');
  for (const command of [...explorer, ...scm]) {
    assert.equal(command.argv[0], process.execPath);
    assert.match(command.argv[1], /run-isolated-workspace-check\.ts$/);
    assert.deepEqual(command.argv.slice(4), ['--', 'code']);
    assert.equal(command.env.BUILDR_BROWSER_WEB_DIST_ROOT, root);
  }
  assert.notEqual(explorer[0].env, scm[0].env);
});

test('full browser selection discovers all active selectors once', () => {
  const commands = planBrowserCommands(['all'], '/tmp/web-dist', {});
  assert.equal(commands.length, BROWSER_SELECTORS.length);
  assert.deepEqual(commands.filter(item => item.argv.at(-1) === 'code').map(item => item.id), ['browser:code-explorer:explorer', 'browser:code:source-control']);
  assert.equal(new Set(commands.map(item => item.id)).size, commands.length);
});

test('compatible browser selectors share one host in a bundle command', () => {
  const commands = planBrowserCommands(['core', 'shell', 'workbench'], '/tmp/web-dist', {});
  assert.equal(commands.length, 1);
  assert.equal(commands[0].id, 'browser:bundle:reading');
  assert.deepEqual(commands[0].argv.slice(4), ['--', 'core,shell,workbench']);
  assert.equal(commands[0].env.BUILDR_BROWSER_WEB_DIST_ROOT, '/tmp/web-dist');
  const partial = planBrowserCommands(['shell', 'workbench'], '/tmp/web-dist', {});
  assert.equal(partial.length, 1);
  assert.deepEqual(partial[0].argv.slice(4), ['--', 'shell,workbench']);
  const independent = planBrowserCommands(['articles', 'project'], '/tmp/web-dist', {});
  assert.deepEqual(independent.map(item => item.id), ['browser:articles', 'browser:project']);
});

test('source-control diagnostic focus remains scoped to its explicit check', () => {
  for (const focus of ['all', 'branch|source']) {
    const commands = planBrowserCommands(['code'], '/tmp/web-dist', { BUILDR_SOURCE_CONTROL_FOCUS: focus });
    assert.equal(commands.length, 1);
    assert.equal(commands[0].env.BUILDR_SOURCE_CONTROL_FOCUS, focus);
  }
});

test('conflicting diagnostic input is rejected without changing unrelated checks', () => {
  const conflict = { BUILDR_CODE_EXPLORER_FOCUS: 'all', BUILDR_SOURCE_CONTROL_FOCUS: 'all' };
  assert.throws(() => planBrowserCommands(['code'], '/tmp/web-dist', conflict), error => error instanceof Error && 'code' in error && error.code === 'browser_code_focus_conflict');
  assert.throws(() => planBrowserCommands(['code-explorer'], '/tmp/web-dist', { BUILDR_CODE_EXPLORER_FOCUS: '1' }), error => error instanceof Error && 'code' in error && error.code === 'browser_code_explorer_focus_invalid');
  assert.deepEqual(planBrowserCommands(['project'], '/tmp/web-dist', conflict).map(item => item.id), ['browser:project']);
});

test('test-only changes retain ownership without inferring unrelated product tags', async () => {
  const { semanticTagsForPaths } = await import('../verification/semantic-tags.ts');
  const file = 'services/buildr-web/test/browser/task-list-journey.ts';
  assert.deepEqual(semanticTagsForPaths([file]), []);
  const testPlan = createVerificationPlan({ paths: [file], related: true, semantic: true, target: 'source' });
  const ids = testPlan.steps.map((s: any) => s.id);
  assert.ok(ids.includes('test-typecheck'));
  assert.equal(ids.some((id: string) => id.startsWith('agent-integration')), false);
  const explicit = createVerificationPlan({ paths: [file], tags: ['handoff'], related: true, semantic: true, target: 'source' });
  assert.ok(explicit.steps.some((s: any) => s.id === 'agent-integration-handoff'));
  const transport = createVerificationPlan({ paths: ['services/buildr-harness/src/process/transport.ts'], related: true, semantic: true, target: 'source' });
  assert.ok(transport.steps.some((s: any) => s.id === 'agent-integration-handoff'));
  const preparation = createVerificationPlan({ paths: ['test/verification/web-dist.ts'], related: true, semantic: true, target: 'source' });
  assert.ok(preparation.steps.some((s: any) => s.id.startsWith('e2e-browser:')));
});

test('shared framework changes retain contract owners without inferred broad tags', async () => {
  const { semanticTagsForPaths } = await import('../verification/semantic-tags.ts');
  for (const file of ['test/verification/ownership.ts', 'test/verification/ownership/runtime.ts',
    'test/verification/planner.ts', 'test/verification/changed-paths.ts']) {
    assert.deepEqual(semanticTagsForPaths([file]), [], file);
    const request = { paths: [file], related: true, target: 'source' };
    const direct = createVerificationPlan(request);
    const inferred = createVerificationPlan({ ...request, semantic: true });
    assert.deepEqual(inferred.steps.map((s: any) => s.id), direct.steps.map((s: any) => s.id), file);
    for (const id of ['unit', 'integration-changed-paths', 'integration-verification-runtime']) {
      assert.ok(inferred.steps.some((s: any) => s.id === id), file);
    }
    const explicit = createVerificationPlan({ ...request, semantic: true, tags: ['handoff'] });
    assert.ok(explicit.steps.some((s: any) => s.id === 'agent-integration-handoff'));
  }
});
