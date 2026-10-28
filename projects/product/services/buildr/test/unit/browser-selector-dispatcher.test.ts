import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { BROWSER_SELECTORS, parseChangedPaths, planBrowserCommands, planCodeBrowserGroups, runAgentConversationCommands, selectBrowserSelectors } from '../verification/browser-selector-dispatcher.ts';
import { createVerificationPlan } from '../verification/planner.ts';
import { resolveVerificationExecutionProfile, verificationSteps } from '../verification/registry.ts';
import { AGENT_CONVERSATION_GROUPS, AGENT_CONVERSATION_WORKERS, parseAgentConversationBatch, runAgentConversationBatch } from '../../../buildr-web/test/browser/agent-conversation-groups.ts';
import { claimAgentConversationGroups, finishAgentConversationGroup, inspectAgentConversationQueue } from '../../../buildr-web/test/browser/agent-conversation-queue.ts';
import { guardConversationServerWrite, resetConversationVisits } from '../../../buildr-web/test/browser/agent-conversation-isolation.ts';

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
 const commands=planBrowserCommands(['all'],'/tmp/web-dist',{});assert.equal(commands.length,BROWSER_SELECTORS.length+AGENT_CONVERSATION_WORKERS-1);
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
  assert.deepEqual(commands.map(item=>item.id),['browser:agent-conversations:worker-1','browser:agent-conversations:worker-2']);
  for(const command of commands){assert.equal(command.argv.at(-1),'agent-conversations');assert.equal(command.env.BUILDR_BROWSER_WEB_DIST_ROOT,'/tmp/conversation-web-dist');assert.equal(command.env.BUILDR_AGENT_JOURNEY_USES_QUEUE,'1');assert.equal(command.env.BUILDR_AGENT_JOURNEY_PART,'');assert.match(command.argv[1],/run-isolated-workspace-check\.ts$/);}
  for(const group of AGENT_CONVERSATION_GROUPS){
    const focused=planBrowserCommands(['agent-conversations'],'/tmp/conversation-web-dist',{BUILDR_AGENT_JOURNEY_PART:group,BUILDR_AGENT_JOURNEY_BATCH:'stale'});
    assert.deepEqual(focused.map(item=>item.id),['browser:agent-conversations:'+group]);
    assert.equal(focused[0].env.BUILDR_AGENT_JOURNEY_PART,group);
    assert.equal(focused[0].env.BUILDR_AGENT_JOURNEY_BATCH,'');
    assert.equal(focused[0].env.BUILDR_AGENT_JOURNEY_QUEUE_ROOT,'');
    assert.equal(focused[0].env.BUILDR_AGENT_JOURNEY_USES_QUEUE,'');
  }
  assert.throws(()=>planBrowserCommands(['agent-conversations'],'/tmp/conversation-web-dist',{BUILDR_AGENT_JOURNEY_PART:'typo'}),error=>error instanceof Error && 'code' in error && error.code==='browser_agent_conversation_focus_invalid');
});

test('a shared queue claims each group once and distinguishes unfinished work', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'conversation-queue-unit-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const first=claimAgentConversationGroups(root),second=claimAgentConversationGroups(root);
  const a=first.next().value!,b=second.next().value!;
  assert.notEqual(a,b);
  finishAgentConversationGroup(root,a);
  const rest=[...first,...second];
  for(const group of rest)finishAgentConversationGroup(root,group);
  const state=inspectAgentConversationQueue(root);
  assert.deepEqual(state.unclaimed,[]);
  assert.deepEqual(state.unfinished,[b]);
  assert.equal(state.attempted.length,AGENT_CONVERSATION_GROUPS.length-1);
  finishAgentConversationGroup(root,b);
  assert.deepEqual(inspectAgentConversationQueue(root).attempted,[...AGENT_CONVERSATION_GROUPS]);
});

test('an unusable environment leaves subsequent groups unclaimed', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'conversation-queue-taint-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  let healthy=true;
  await assert.rejects(runAgentConversationBatch(claimAgentConversationGroups(root),{
    preparePage:async()=>{},
    runGroup:async()=>{healthy=false;throw new Error('broken browser');},
    afterGroup:group=>finishAgentConversationGroup(root,group),
    canContinue:()=>healthy,
  }),AggregateError);
  const state=inspectAgentConversationQueue(root);
  assert.deepEqual(state.attempted,['setup']);
  assert.equal(state.unclaimed.length,AGENT_CONVERSATION_GROUPS.length-1);
});

test('only unmocked server writes are blocked in a shared conversation environment', async () => {
  const blocked:string[]=[];let continued=0;const responses:any[]=[];
  const route=(method:string,url='http://localhost/api/v1/workspaces/demo/tasks',status='current')=>({
    request:()=>({method:()=>method,url:()=>url,postDataJSON:()=>({workspaceId:'demo'})}),
    continue:async()=>{continued++;},
    fulfill:async(response:any)=>{responses.push(response);},
    fetch:async()=>({ok:()=>true,json:async()=>({ready:true,workspaceId:'demo',resourceRefresh:{status}})}),
    abort:async()=>{},
  });
  await guardConversationServerWrite(route('GET'),blocked,['demo']);
  await guardConversationServerWrite(route('POST'),blocked,['demo']);
  await guardConversationServerWrite(route('POST','http://localhost/api/v1/workspaces/open'),blocked,['demo']);
  await guardConversationServerWrite(route('POST','http://localhost/api/v1/workspaces/open'),blocked,['other']);
  await guardConversationServerWrite(route('POST','http://localhost/api/v1/workspaces/demo/workbench/visits'),blocked,['demo']);
  assert.equal(continued,2);
  assert.deepEqual(blocked,['POST /api/v1/workspaces/demo/tasks','POST /api/v1/workspaces/open']);
  assert.equal(responses[0].status,409);
});

test('real recent visits are cleared while unknown workbench state is preserved', () => {
  const rows = new Map<string,any[]>([
    ['one',[{kind:'recent-resource',key:'task:a'},{kind:'recent-resource',key:'task:b'}]],
    ['two',[{kind:'recent-resource',key:'task:c'}]],
  ]);
  const app = {
    inspectWorkbenchPreferences:(root:string)=>({items:rows.get(root)}),
    removeWorkbenchPreference:(root:string,kind:string,key:string)=>rows.set(root,rows.get(root)!.filter(item=>item.kind!==kind||item.key!==key)),
  };
  resetConversationVisits(app,['one','two']);
  assert.deepEqual(rows.get('one'),[]);
  assert.deepEqual(rows.get('two'),[]);
  rows.set('one',[{kind:'recent-resource',key:'task:a'}]);
  rows.set('two',[{kind:'pinned-task',key:'must-keep'}]);
  assert.throws(()=>resetConversationVisits(app,['one','two']));
  assert.equal(rows.get('one')!.length,1);
  assert.equal(rows.get('two')![0].key,'must-keep');
});

test('conversation batches accept only distinct known groups',()=>{
  assert.equal(parseAgentConversationBatch(undefined),null);
  assert.deepEqual(parseAgentConversationBatch('["models","selection"]'),['models','selection']);
  for(const value of ['{','[]','["models","models"]','["unknown"]','["history",1]']){
    assert.throws(()=>parseAgentConversationBatch(value));
  }
});

test('a failed group does not stop the next isolated page and remains a failure',async()=>{
  const seen:string[]=[];
  const pages: Record<string, string>[] = [];
  let page:Record<string,string>={};
  await assert.rejects(runAgentConversationBatch(['setup','video'],{
    preparePage:async()=>{page={};pages.push(page);},
    runGroup:async(group)=>{
      seen.push(group);
      if(group==='setup'){page.preference='dirty';throw new Error('fixture failure');}
      assert.equal(page.preference,undefined);
      page.video='passed';
    },
  }),AggregateError);
  assert.deepEqual(seen,['setup','video']);
  assert.notEqual(pages[0],pages[1]);
  assert.equal(pages[0].preference,'dirty');
  assert.equal(pages[1].video,'passed');
});

test('conversation batching respects the outer budget and releases a slot after failure',async()=>{
  const commands=['a','b','c','d'].map(id=>({id}));
  let active=0,peak=0;
  const ran:string[]=[],released:string[]=[];
  let serial=0;
  const results=await runAgentConversationCommands(commands,{
    limit:2,
    acquire:async()=>{
      const ticket=String(serial++);
      active++;peak=Math.max(peak,active);
      return {release:async()=>{active--;released.push(ticket);return [{status:'released'}];}};
    },
    run:async(command:any)=>{
      ran.push(command.id);
      await new Promise(resolve=>setTimeout(resolve,10));
      if(command.id==='b')throw new Error('simulated group failure');
      return {status:'passed'};
    },
  });
  assert.equal(peak,2);
  assert.equal(active,0);
  assert.equal(released.length,commands.length);
  assert.deepEqual(ran.sort(),['a','b','c','d']);
  assert.deepEqual(results.map(item=>item.status),['passed','failed','passed','passed']);
});

test('cancelling conversation batches releases the active slot without starting pending work',async()=>{
  const controller=new AbortController();
  let acquired=0,released=0;
  const results=await runAgentConversationCommands([{id:'first'},{id:'pending'}],{
    limit:1,signal:controller.signal,
    acquire:async()=>{acquired++;return {release:async()=>{released++;return [{status:'released'}];}};},
    run:async()=>{controller.abort();return {status:'cancelled'};},
  });
  assert.equal(acquired,1);
  assert.equal(released,1);
  assert.deepEqual(results.map(item=>item.status),['cancelled','failed']);
});

test('unconfirmed process cleanup retains the browser slot and stops pending work',async()=>{
  const controller=new AbortController();
  let acquired=0,released=0,started=0;
  const results=await runAgentConversationCommands([{id:'unsafe'},{id:'pending'}],{
    limit:1,signal:controller.signal,onUnsafeCleanup:()=>controller.abort(),
    acquire:async()=>{acquired++;return {release:async()=>{released++;return [{status:'released'}];}};},
    run:async()=>{started++;return {status:'failed',processCleanup:{status:'failed'}};},
  });
  assert.equal(acquired,1);
  assert.equal(released,0);
  assert.equal(started,1);
  assert.equal(controller.signal.aborted,true);
  assert.deepEqual(results.map(item=>item.status),['failed','failed']);
});

test('conversation check accounts for two browser workers without a parent lease deadlock',()=>{
  const step=verificationSteps.find((item:any)=>item.id==='e2e-browser:agent-conversations');
  assert.deepEqual(step.resourceClaims,[]);
  assert.deepEqual(step.resourceDemand,{workers:2,processes:2,workspaceIo:2});
  for(const id of ['local','ci','ci-workspace-limited']){
    const limits=resolveVerificationExecutionProfile(id).limits;
    assert.ok(limits.capacities.workers>=2);
    assert.ok(limits.capacities.processes>=2);
    assert.ok(limits.capacities.workspaceIo>=2);
    assert.equal(limits.resources['browser-runtime'],2);
  }
});
