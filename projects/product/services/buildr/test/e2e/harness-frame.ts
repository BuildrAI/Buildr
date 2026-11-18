import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import {buildWebDist} from '../../tools/build/web-dist.ts';
import {createRuntime as createFixture} from '../helpers/runtime-harness.ts';
import {createRuntime,runtimeProvide} from '../../src/bootstrap/runtime.ts';
import {WORKSPACE_APPLICATION} from '../../src/modules/workspace/module.ts';
import {AGENT_SERVICE_APPLICATION} from '../../src/modules/agent-service/module.ts';
import {createLocalWorkspaceServer} from '../../src/web/http/server.ts';
import {stopAgentProcess} from '@buildr-ai/buildr-harness';
import {launchTestBrowser} from './browser-launch.ts';
const root=process.env.BUILDR_SMOKE_ROOT;if(!root)throw new Error('isolated_workspace_runner_required');
const work=path.join(root,'workspace');
const fixture=createFixture();fixture.initializeWorkspace({targetRoot:work,name:'嵌套网页验收',description:'隔离工程现场',profile:'team',agent:null});
const workTwo=path.join(root,'workspace-two');fixture.initializeWorkspace({targetRoot:workTwo,name:'切换工作空间验收',description:'第二隔离现场',profile:'team',agent:null});
// A real isolated Git checkout proves file-source resolution; no user checkout is touched.
execFileSync('git',['init','--initial-branch=dev'],{cwd:work,stdio:'pipe'});
fs.writeFileSync(path.join(work,'surface-proof.md'),'# same-page file proof\n');
execFileSync('git',['add','--','surface-proof.md'],{cwd:work});
execFileSync('git',['-c','user.name=Harness fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture'],{cwd:work,stdio:'pipe'});
fixture.createCatalogRepository(work,{revision:fixture.assetCatalog(work).revision,code:'surface-code',name:'同页文件验收',path:'.'});
fixture.createTask(work,{taskId:'frame-task',title:'框内关联任务',intent:'核对工程关联归属',status:'active',projects:[],services:[],changes:[]});
const runtime=createRuntime(),workspace=runtimeProvide(runtime,WORKSPACE_APPLICATION);
workspace.ensureRegisteredTarget(workTwo);
const staticRoot=process.env.BUILDR_BROWSER_WEB_DIST_ROOT??buildWebDist(path.join(root,'production-web-dist'));
const serverOptions={ensureRegisteredTarget:workspace.ensureRegisteredTarget,resolveRegisteredWorkspace:workspace.resolveRegisteredWorkspace,targetRoot:work,webProfile:{profile:'development'},staticRoot};
let activeApp=createLocalWorkspaceServer(runtime,serverOptions);
const browser=await launchTestBrowser();
try{
 const {url,initialWorkspaceId}=await activeApp.ready;
 const port=Number(new URL(url).port);
 const unauthorized=await fetch(url+'/harness/');assert.equal(unauthorized.status,403,'frame entry requires its navigation cookie');
 const landing=await browser.newPage({viewport:{width:1440,height:1000}});
 try{
  await landing.goto(url+'/');
  const landingFrame=landing;
  const landingInput=landingFrame.getByRole('textbox',{name:'对话输入',exact:true});
  await landingInput.waitFor({timeout:30000});
  assert.equal(await landing.locator('.harness-environment-region').isVisible(),false,'fresh root entry starts with Harness, not the engineering catalog');
  await landingInput.fill('根入口未发送草稿');
  await landing.locator('.harness-conversation-surface').evaluate(node=>node.setAttribute('data-root-frame','retained'));
  await landing.getByRole('button',{name:'打开Development',exact:true}).click();
  await landing.locator('.harness-environment-region .app-shell').waitFor({state:'visible'});
  assert.equal(await landing.getByRole('button',{name:'添加工作空间',exact:true}).isVisible(),true,'real existing engineering catalog is mounted');
  const resize=landing.getByRole('separator',{name:'调整对话宽度',exact:true});
  await resize.focus();await resize.press('ArrowLeft');
  assert.equal(await resize.getAttribute('aria-valuenow'),'636','existing keyboard resize and preference remain available');
  assert.equal(Math.round((await landing.locator('.harness-conversation-region').boundingBox())!.width),636);
  await landing.locator('.harness-environment-region .app-shell').evaluate(node=>node.setAttribute('data-engineering-identity','retained'));
  if(process.env.BUILDR_SCREENSHOT_DIR)await landing.screenshot({path:path.join(process.env.BUILDR_SCREENSHOT_DIR,'harness-development-mounted.png')});
  await landing.getByRole('button',{name:'收起Development',exact:true}).click();
  assert.equal(await landing.locator('.harness-environment-region').isVisible(),false);
  await landing.getByRole('button',{name:'打开Development',exact:true}).click();
  assert.equal(await landing.locator('.harness-environment-region .app-shell').getAttribute('data-engineering-identity'),'retained');
  assert.equal(await landing.locator('.harness-conversation-surface').getAttribute('data-root-frame'),'retained');
  assert.equal(await landingInput.inputValue(),'根入口未发送草稿');
  await landing.setViewportSize({width:390,height:844});
  await landing.getByRole('button',{name:'收起Development',exact:true}).click();
  await landingInput.fill('窄屏根入口草稿');
  await landing.getByRole('button',{name:'打开Development',exact:true}).click();
  assert.equal(await landing.locator('.harness-environment-region').isVisible(),true);
  await landing.evaluate(()=>localStorage.setItem('buildr.harness-panel-full','true'));
  await landing.goto(url+'/?catalog=1');
  await landing.locator('.harness-environment-region .app-shell').waitFor({state:'visible'});
  assert.equal(new URL(landing.url()).searchParams.get('catalog'),'1','explicit engineering catalog is not hidden by a saved conversation focus');
 }finally{await landing.close();}
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url+'/workspaces/'+initialWorkspaceId+'/overview');
 await page.locator('.harness-environment-region .app-shell').waitFor({state:'visible'});
 assert.equal(await page.locator('.development-harness-frame').isVisible(),false,'fresh engineering deep link keeps the original full engineering width');
 const frame=page;
 const openConversation=async(id:string)=>{
  const target=page.locator('.ac-history-list button[data-conversation-id="'+id+'"]:visible');
  const search=page.getByRole('textbox',{name:'搜索对话',exact:true});
  if(!await search.isVisible())await page.locator('.ac-collapsed-rail .ac-all-conversations').click();
  await search.waitFor();await search.fill('');
  await target.first().click();
 };

 await page.locator('.development-harness-rail').getByRole('button',{name:'新建对话',exact:true}).click();
 assert.equal(await page.getByRole('dialog',{name:'选择新对话的工作空间'}).count(),0,'new conversation stays in place');
 assert.equal(await page.locator('.development-harness-frame>header').count(),0,'no duplicate outer toolbar');
 await frame.getByRole('textbox',{name:'对话输入',exact:true}).waitFor({timeout:30000});
 await page.reload();
 await page.locator('.development-harness-frame').waitFor({state:'visible'});
 await frame.getByRole('textbox',{name:'对话输入',exact:true}).waitFor({timeout:30000});
 assert.equal(await page.locator('iframe[title="Buildr Harness"]').count(),0,'first-party complete conversation is in the same page');
 await page.locator('.harness-conversation-surface').evaluate((node:HTMLElement)=>{node.dataset.acceptanceIdentity='retained';});
 await frame.locator('.ac-welcome').getByRole('combobox',{name:'新对话工作空间',exact:true}).waitFor();
 const workspaceBounds=await frame.getByRole('button',{name:'对话信息与工作空间',exact:true}).boundingBox();assert.ok(workspaceBounds&&workspaceBounds.y+workspaceBounds.height<=1000,'workspace metadata remains within viewport');
 const input=frame.getByRole('textbox',{name:'对话输入',exact:true});await input.fill('不会发送的验收草稿');
 // Forged protocol/source must not switch or submit the actual conversation.
 await page.evaluate(()=>window.postMessage({protocol:'buildr.harness-frame/v1',event:'selection',workspaceId:'forged',conversationId:'forged'},location.origin));
 await frame.getByRole('button',{name:'更多对话操作',exact:true}).click();await frame.getByText('专注对话',{exact:true}).click();await page.locator('.development-harness-frame.is-full').waitFor();if(process.env.BUILDR_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.BUILDR_SCREENSHOT_DIR,'development-harness-focused.png')});assert.equal(await page.locator('.harness-conversation-surface').getAttribute('data-acceptance-identity'),'retained');assert.equal(await input.inputValue(),'不会发送的验收草稿');
 await frame.getByRole('button',{name:'更多对话操作',exact:true}).click();await frame.getByText('恢复分屏',{exact:true}).click();await page.locator('.development-harness-frame.is-full').waitFor({state:'hidden'});assert.equal(await input.inputValue(),'不会发送的验收草稿');
 await frame.getByRole('button',{name:'更多对话操作',exact:true}).click();await frame.getByText('收起对话',{exact:true}).click();await page.locator('.development-harness-frame').waitFor({state:'hidden'});if(process.env.BUILDR_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.BUILDR_SCREENSHOT_DIR,'development-harness-collapsed.png')});assert.equal(await page.locator('.development-harness-frame').isVisible(),false);assert.equal(await page.locator('.development-harness-rail').evaluate(node=>node.getBoundingClientRect().width),52);await page.reload();await page.locator('.development-harness-rail').waitFor({state:'visible'});assert.equal(await page.locator('.development-harness-frame').isVisible(),false);await page.locator('.harness-conversation-surface').evaluate((node:HTMLElement)=>{node.dataset.acceptanceIdentity='retained';});await page.locator('.development-harness-rail').getByRole('button',{name:'展开当前对话',exact:true}).click();assert.equal(await input.inputValue(),'不会发送的验收草稿');
 const conversation=await page.evaluate(async(workspaceId)=>{const token=document.querySelector('meta[name="buildr-session"]')!.getAttribute('content')!;const response=await fetch(`/api/v1/workspaces/${workspaceId}/agent-conversations`,{method:'POST',headers:{'content-type':'application/json','x-buildr-session':token},body:'{}'});const value=await response.json();if(!response.ok)throw Error(JSON.stringify(value));return value;},initialWorkspaceId);
 // Empty records are deliberately absent from real history. Expose only this
 // controlled setup record in the list fixture; selection/read/PATCH still use real HTTP.
 await page.route('**/api/v1/app/agent-service/conversations?*',async route=>{
  const target=new URL(route.request().url());
  if(target.searchParams.get('query')||target.searchParams.get('workspaceId')&&target.searchParams.get('workspaceId')!==initialWorkspaceId)return route.continue();
  const response=await route.fetch();if(response.status()!==200)return route.fulfill({response});
  const body=await response.json();
  if(!body.conversations.some((row:{id:string})=>row.id===conversation.id)){body.conversations.unshift(conversation);body.total=(body.total??0)+1;}
  await route.fulfill({response,json:body});
 });
 await frame.locator('.ac-collapsed-rail .ac-all-conversations').click();await page.locator('.ac-engineering-context').waitFor({state:'hidden'});
 await openConversation(conversation.id);
 await page.getByRole('button',{name:'关联任务',exact:true}).click();
 await page.locator('.ac-association-search input').fill('框内');
 const saved=page.waitForResponse(response=>response.request().method()==='PATCH'&&response.url().endsWith('/agent-conversations/'+conversation.id));
 await page.locator('.ac-association-candidate').filter({hasText:'框内关联任务'}).click();const savedResponse=await saved;assert.equal(savedResponse.status(),200);const savedView=await savedResponse.json();assert.ok(savedView.taskLinks.some((link:{taskId:string})=>link.taskId==='frame-task'));
 await page.waitForFunction(async({workspaceId,id})=>{const token=document.querySelector('meta[name="buildr-session"]')!.getAttribute('content')!;const response=await fetch(`/api/v1/workspaces/${workspaceId}/agent-conversations/${id}`,{headers:{'x-buildr-session':token}});const value=await response.json();return value.taskLinks?.some((link:{taskId:string})=>link.taskId==='frame-task');},{workspaceId:initialWorkspaceId,id:conversation.id});
 assert.equal(await page.locator('.ac-engineering-context').getByRole('button',{name:'关联任务',exact:true}).count(),1,'Development renders its own controls in the semantic context slot');
 await page.locator('[data-associated-task="frame-task"]').click();await page.waitForURL('**/tasks/frame-task');
 await page.locator('#task-detail-main[data-task-id="frame-task"]').waitFor({state:'visible'});
 assert.equal(await page.locator('.harness-conversation-surface').getAttribute('data-acceptance-identity'),'retained','engineering navigation never remounts the original conversation');
 assert.equal(await page.locator('.harness-environment-region').isVisible(),true,'task navigation expands the real engineering environment');
 assert.equal(await page.locator('.development-harness-frame').getAttribute('data-selected-workspace'),initialWorkspaceId,'browsing task retains the exact original conversation scope');
 await page.locator('#task-more-actions').click();await page.locator('#task-edit-action').click();
 await page.locator('#task-edit-title').fill('工作环境隐藏后保留的草稿');
 // Exercise an external shell visibility transition while the modal owns pointer focus.
 await page.getByRole('button',{name:'收起Development',exact:true}).evaluate((node:HTMLButtonElement)=>node.click());
 await page.locator('#task-edit-title').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'打开Development',exact:true}).click();
 await page.locator('#task-edit-title').waitFor({state:'visible'});
 assert.equal(await page.locator('#task-edit-title').inputValue(),'工作环境隐藏后保留的草稿');
 await page.keyboard.press('Escape');if(process.env.BUILDR_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.BUILDR_SCREENSHOT_DIR,'development-harness-embedded.png')});
 await frame.locator('.ac-collapsed-rail .ac-account-settings').click();await frame.getByRole('tab',{name:'智能体',exact:true}).waitFor();
 await frame.getByRole('button',{name:'关闭智能体与模型设置',exact:true}).click();
 await input.waitFor();
 await input.fill('重启恢复草稿');
 const oldOuterToken=await page.evaluate(()=>document.querySelector('meta[name="buildr-session"]')?.getAttribute('content'));
 const oldFrameToken=await frame.locator('meta[name="buildr-session"]').getAttribute('content');
 assert.ok(oldOuterToken&&oldFrameToken);
 await activeApp.shutdown();
 activeApp=createLocalWorkspaceServer(runtime,{...serverOptions,port});
 const restarted=await activeApp.ready;
 assert.equal(restarted.url,url);
 assert.notEqual(restarted.sessionToken,oldOuterToken);
 const staleFrameRes=await fetch(url+'/harness/',{headers:{cookie:'buildr-frame='+oldFrameToken}});
 assert.equal(staleFrameRes.status,403,'stale frame cookie remains rejected on direct /harness/ navigation');
 await frame.locator('.ac-collapsed-rail .ac-all-conversations').click();
 const recoveredHistoryRead=page.waitForResponse(response=>response.request().method()==='GET'&&response.url().includes('/api/v1/app/agent-service/conversations')&&response.url().includes('query=')&&response.status()===200);
 await frame.getByRole('textbox',{name:'搜索对话',exact:true}).fill('恢复核验');
 await recoveredHistoryRead;
 assert.equal(await frame.getByText(/Buildr Web session 已失效/).count(),0);
 await openConversation(conversation.id);
 await input.waitFor();
 assert.equal(await input.inputValue(),'重启恢复草稿');
 assert.equal(await page.locator('.harness-conversation-surface').getAttribute('data-acceptance-identity'),'retained');
 await page.getByRole('button',{name:'关联任务',exact:true}).click();
 const patchAfterRestart=page.waitForResponse(response=>response.request().method()==='PATCH'&&response.url().endsWith('/agent-conversations/'+conversation.id)&&response.status()===200);
 await page.getByRole('button',{name:'解除关联 frame-task',exact:true}).click();
 await patchAfterRestart;
 await page.waitForFunction((expected:string)=>{
   const outer=document.querySelector('meta[name="buildr-session"]')?.getAttribute('content');
   return outer===expected;
 },restarted.sessionToken);
 assert.equal(await page.getByText(/Buildr Web session 已失效/).count(),0);
 assert.equal(await frame.getByText(/Buildr Web session 已失效/).count(),0);

 // Focus mode + open conversation list persists across reload (including under saturated localStorage source-control cache), workspace switching in new conversation keeps it open, and rail button exits history cleanly.
 await page.evaluate(()=>{
  const chunk='x'.repeat(1_000_000);
  for(let i=0;i<16;i+=1){try{localStorage.setItem(`buildr:source-control-cache:v1:fill-${i}`,chunk);}catch{break;}}
 });
 await frame.getByRole('button',{name:'更多对话操作',exact:true}).click();
 await frame.getByText('专注对话',{exact:true}).click();
 await page.locator('.development-harness-frame.is-full').waitFor();
 await frame.locator('.ac-collapsed-rail .ac-all-conversations').click();
 await frame.locator('.ac-focus-history-pane').waitFor({state:'visible'});
 await page.locator('.ac-engineering-context').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>localStorage.getItem('buildr.harness-panel-full')),'true');
 await page.reload();
 await page.locator('.development-harness-frame.is-full').waitFor({state:'visible'});
 await frame.locator('.ac-focus-history-pane').waitFor({state:'visible'});
 await frame.locator('.ac-collapsed-rail .ac-new-conversation').click();
 await frame.locator('.ac-welcome .ant-select').filter({has:frame.getByRole('combobox',{name:'新对话工作空间',exact:true})}).click();
 await frame.locator('.ac-panel-popup .ant-select-item-option').filter({hasText:'切换工作空间验收'}).click();
 assert.equal(await frame.locator('.ac-focus-history-pane').isVisible(),true,'switching workspace while creating a conversation preserves open history list');
 await frame.locator('.ac-collapsed-rail .ac-current-conversation').click();
 await frame.locator('.ac-focus-history-pane').waitFor({state:'hidden'});
 assert.equal(await page.locator('.development-harness-frame.is-full').isVisible(),true,'clicking current conversation rail exits history view without collapsing focus panel');

 // Rendered Mermaid diagrams in stream fit proportionally without scrollbars and open in Development top-level fullscreen modal in the same page.
 const mermaidRoute=`**/api/v1/workspaces/${initialWorkspaceId}/agent-conversations/${conversation.id}`;
 await page.route(mermaidRoute,async route=>{
  if(route.request().method()!=='GET')return route.continue();
  const response=await route.fetch();
  const body=await response.json();
  body.entries=[...(body.entries??[]),{id:'mermaid-preview-entry',kind:'message',role:'assistant',text:'流程图：\n\n```mermaid\nsequenceDiagram\nparticipant U as 鲜虾小程序终端\nparticipant W as 微信支付通道\nparticipant S as 扫呗聚合收银台\nparticipant B as 鲜虾后端服务系统\nparticipant C as 财务清分中心\nU->>W: 发起聚合下单与支付授权\nW->>S: 推送支付交易结果通知\nS->>B: 向 notify_url 异步通知支付成功\nB->>B: 验签核对金额并落库收款记录\nB-->>S: 返回规定成功应答\nU->>B: 主动轮询查单并刷新履约状态\nB->>C: 写入应收结算待确认账单\n```\n',createdAt:new Date().toISOString()}];body.entries.push({id:'surface-links',kind:'message',role:'assistant',text:'[验收文件](surface-proof.md)\n\n[不确定文件](../outside.md)\n\n[工程任务](@task/frame-task)',createdAt:new Date().toISOString()});body.entries.push({id:'reading-retention-entry',kind:'message',role:'assistant',text:Array.from({length:80},(_,index)=>'独立验收段落 '+index).join('\n\n'),createdAt:new Date().toISOString()});
  await route.fulfill({response,json:body});
 });
 await openConversation(conversation.id);
 const zoomDiagram=frame.locator('#agent-conversation-panel .markdown-diagram[data-mermaid-state="rendered"] button[data-zoom-diagram]');
 await zoomDiagram.waitFor({timeout:30000});
 const streamBoxMetrics=await frame.locator('#agent-conversation-panel .markdown-diagram-view').evaluate(node=>({clientW:node.clientWidth,scrollW:node.scrollWidth,clientH:node.clientHeight,scrollH:node.scrollHeight}));
 assert.ok(streamBoxMetrics.scrollW<=streamBoxMetrics.clientW&&streamBoxMetrics.scrollH<=streamBoxMetrics.clientH,`embedded stream Mermaid diagram must fit without scrollbars: ${JSON.stringify(streamBoxMetrics)}`);
 await zoomDiagram.click();
 const diagramDialog=page.getByRole('dialog',{name:'流程图预览',exact:true});
 await diagramDialog.waitFor({state:'visible'});
 const zoomBefore=await diagramDialog.getByLabel('当前缩放比例',{exact:true}).textContent();
 await diagramDialog.getByRole('button',{name:'放大流程图',exact:true}).click();
 const zoomAfter=await diagramDialog.getByLabel('当前缩放比例',{exact:true}).textContent();
 assert.notEqual(zoomAfter,zoomBefore);
 await diagramDialog.getByRole('button',{name:'导出图片',exact:true}).waitFor({state:'visible'});
 await diagramDialog.getByRole('button',{name:'复制源码',exact:true}).waitFor({state:'visible'});
 await page.keyboard.press('Escape');
 await diagramDialog.waitFor({state:'hidden'});
 await page.locator('#agent-conversation-panel').getByRole('link',{name:'不确定文件',exact:true}).click();
 await page.getByText('不能确认文件的准确工程来源。',{exact:true}).waitFor();
 const actualFileRead=page.waitForResponse(response=>response.url().includes('/code/file?')&&new URL(response.url()).searchParams.get('filePath')==='surface-proof.md'&&response.status()===200);
 await page.locator('#agent-conversation-panel').getByRole('link',{name:'验收文件',exact:true}).click();
 const fileRead=await actualFileRead;assert.match((await fileRead.json()).content,/same-page file proof/);
 await page.waitForURL('**/code/explorer');
 assert.equal(await page.locator('.development-harness-frame').getAttribute('data-selected-conversation'),conversation.id,'opening a real file does not retarget conversation');
 await page.getByRole('button',{name:'收起Development',exact:true}).click();
 await page.locator('#agent-conversation-panel').getByRole('link',{name:'工程任务',exact:true}).click();
 await page.waitForURL('**/tasks/frame-task');
 await page.getByRole('button',{name:'收起Development',exact:true}).click();
 const stream=page.locator('#agent-conversation-panel .ac-stream');
 await stream.evaluate(node=>{node.scrollTop=120;});
 const readingTop=await stream.evaluate(node=>node.scrollTop);assert.ok(readingTop>0);
 await page.getByRole('button',{name:'打开Development',exact:true}).click();
 await page.getByRole('button',{name:'收起Development',exact:true}).click();
 assert.equal(await stream.evaluate(node=>node.scrollTop),readingTop,'engineering environment toggle preserves stream reading position');
 await page.unrouteAll({behavior:'wait'});
 await page.evaluate(()=>{
  const chunk='y'.repeat(1_000_000);
  for(let i=0;i<16;i+=1){try{localStorage.setItem(`buildr:source-control-cache:v1:split-${i}`,chunk);}catch{break;}}
 });
 await frame.getByRole('button',{name:'更多对话操作',exact:true}).click();
 await frame.getByText('恢复分屏',{exact:true}).click();
 await page.locator('.development-harness-frame.is-full').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>localStorage.getItem('buildr.harness-panel-full')),'false');
 await page.reload();
 await page.locator('.development-harness-frame').waitFor({state:'visible'});
 assert.equal(await page.locator('.development-harness-frame.is-full').isVisible(),false,'split mode must stay active across reload without re-entering focus mode');

 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['authenticated-surface','same-complete-component','workspace-selection','embedded-focused-draft-retention','expanded-and-collapsed-reload-preference','focus-history-reload-persistence','split-mode-reload-persistence','quota-eviction-preference-persistence','new-conversation-workspace-keeps-history','embedded-rail-exits-history-only','stream-diagram-fit-no-scrollbars','mermaid-top-layer-zoom-preview','no-window-bridge-execution','settings-in-surface','development-task-association-and-navigation','in-place-restart-session-recovery'],realModelCalls:0}));
}finally{await browser.close();await activeApp.shutdown();await runtimeProvide(runtime,AGENT_SERVICE_APPLICATION).close();await stopAgentProcess({dataRoot:process.env.BUILDR_APP_DATA_DIR!,mode:'stop-owned'});}
