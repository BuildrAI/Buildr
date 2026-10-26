import assert from 'node:assert/strict';
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
  assert.deepEqual(selectBrowserSelectors(['services/buildr-web/src/features/publication/components/ArticleEditorPanel.tsx']).selectors, ['layout', 'articles']);
  assert.deepEqual(selectBrowserSelectors(['services/buildr-web/src/features/knowledge/components/KnowledgeBrowser.tsx']).selectors, ['layout', 'project', 'service', 'articles']);
  for (const file of ['app/WorkspacePages.tsx', 'app/WorkspacePaneHost.tsx', 'components/WorkspaceStage.tsx']) {
    assert.deepEqual(selectBrowserSelectors([`services/buildr-web/src/${file}`]).selectors, ['layout', 'shell', 'workbench', 'project', 'service', 'articles', 'task', 'task-materials', 'agent-conversations']);
  }
});

test('shared styles and frontend browser scenarios select executable layout coverage', () => {
  for (const file of ['styles.css', 'theme.ts', 'components/workspace-stage.css']) {
    assert.ok(selectBrowserSelectors([`services/buildr-web/src/${file}`]).selectors.includes('layout'));
  }
  assert.deepEqual(selectBrowserSelectors(['services/buildr-web/test/browser/layout-journey.ts']).selectors, ['all']);
});

test('Explorer and SCM are independent explicit checks sharing only the immutable frontend', () => {
  const root='/tmp/buildr-browser-contract/web-dist';
  const explorer=planBrowserCommands(['code-explorer'],root,{}),scm=planBrowserCommands(['code'],root,{});
  assert.deepEqual(explorer.map(item=>item.id),['browser:code-explorer:explorer']);
  assert.deepEqual(scm.map(item=>item.id),['browser:code:source-control']);
  assert.deepEqual(planCodeBrowserGroups({}).map(item=>item.id),['source-control']);
  assert.equal(explorer[0].env.BUILDR_CODE_EXPLORER_FOCUS,'all');assert.equal(explorer[0].env.BUILDR_SOURCE_CONTROL_FOCUS,'');
  assert.equal(scm[0].env.BUILDR_SOURCE_CONTROL_FOCUS,'all');assert.equal(scm[0].env.BUILDR_CODE_EXPLORER_FOCUS,'');
  for(const command of [...explorer,...scm]){
    assert.equal(command.argv[0],process.execPath);assert.match(command.argv[1],/run-isolated-workspace-check\.ts$/);
    assert.deepEqual(command.argv.slice(4),['--','code']);assert.equal(command.env.BUILDR_BROWSER_WEB_DIST_ROOT,root);
  }
  assert.notEqual(explorer[0].env,scm[0].env);
});
test('full browser selection discovers both isolated code checks once',()=>{
 const commands=planBrowserCommands(['all'],'/tmp/web-dist',{});assert.equal(commands.length,BROWSER_SELECTORS.length);
 assert.deepEqual(commands.filter(item=>item.argv.at(-1)==='code').map(item=>item.id),['browser:code-explorer:explorer','browser:code:source-control']);
 assert.equal(new Set(commands.map(item=>item.id)).size,commands.length);
});
test('source-control diagnostic focus remains scoped to its explicit check',()=>{
 for(const focus of ['all','branch|source']){
  const commands=planBrowserCommands(['code'],'/tmp/web-dist',{BUILDR_SOURCE_CONTROL_FOCUS:focus});
  assert.equal(commands.length,1);assert.equal(commands[0].env.BUILDR_SOURCE_CONTROL_FOCUS,focus);
 }
});
test('conflicting diagnostic input is rejected without changing unrelated checks',()=>{
 const conflict={BUILDR_CODE_EXPLORER_FOCUS:'all',BUILDR_SOURCE_CONTROL_FOCUS:'all'};
 assert.throws(()=>planBrowserCommands(['code'],'/tmp/web-dist',conflict),error=>error instanceof Error && 'code' in error && error.code==='browser_code_focus_conflict');
 assert.throws(()=>planBrowserCommands(['code-explorer'],'/tmp/web-dist',{BUILDR_CODE_EXPLORER_FOCUS:'1'}),error=>error instanceof Error && 'code' in error && error.code==='browser_code_explorer_focus_invalid');
 assert.deepEqual(planBrowserCommands(['project'],'/tmp/web-dist',conflict).map(item=>item.id),['browser:project']);
});

test('internal conversation paths select the executable conversation journey and preserve layout applicability',()=>{
  assert.deepEqual(selectBrowserSelectors(['services/buildr-web/src/features/agent-conversations/ConversationPanel.tsx']).selectors,['agent-conversations']);
  assert.deepEqual(selectBrowserSelectors(['services/buildr-web/src/features/agent-conversations/agent-conversations.css']).selectors,['layout','agent-conversations']);
  const commands=planBrowserCommands(['agent-conversations'],'/tmp/conversation-web-dist',{});
  assert.equal(commands.length,1);assert.equal(commands[0].argv.at(-1),'agent-conversations');assert.equal(commands[0].env.BUILDR_BROWSER_WEB_DIST_ROOT,'/tmp/conversation-web-dist');
});
