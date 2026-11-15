import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
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
const runtime=createRuntime(),workspace=runtimeProvide(runtime,WORKSPACE_APPLICATION);
const app=createLocalWorkspaceServer(runtime,{ensureRegisteredTarget:workspace.ensureRegisteredTarget,resolveRegisteredWorkspace:workspace.resolveRegisteredWorkspace,targetRoot:work,webProfile:{profile:'development'},staticRoot:path.resolve(import.meta.dirname,'../../web-dist')});
const browser=await launchTestBrowser();
try{
 const {url,initialWorkspaceId}=await app.ready;
 const unauthorized=await fetch(url+'/harness/');assert.equal(unauthorized.status,403,'frame entry requires its navigation cookie');
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url+'/workspaces/'+initialWorkspaceId+'/overview');
 await page.getByRole('button',{name:'新建对话',exact:true}).first().click();
 const modal=page.getByRole('dialog',{name:'选择新对话的工作空间'});await modal.waitFor();await modal.getByRole('button',{name:'新建对话',exact:true}).click();
 const frame=page.frameLocator('iframe[title="Buildr Harness"]');
 await modal.waitFor({state:'hidden'});
 await frame.getByRole('textbox',{name:'对话输入',exact:true}).waitFor({timeout:30000});
 const frameIdentity=await page.locator('iframe[title="Buildr Harness"]').evaluate((node:HTMLIFrameElement)=>{node.dataset.acceptanceIdentity='retained';return node.src;});assert.equal(new URL(frameIdentity).pathname,'/harness/');
 const input=frame.getByRole('textbox',{name:'对话输入',exact:true});await input.fill('不会发送的验收草稿');
 // Forged protocol/source must not switch or submit the actual conversation.
 await page.evaluate(()=>window.postMessage({protocol:'buildr.harness-frame/v1',event:'selection',workspaceId:'forged',conversationId:'forged'},location.origin));
 console.log('frame-layout',await page.locator('.development-harness-frame').evaluate(node=>({html:node.outerHTML.slice(0,2300),rect:node.getBoundingClientRect().toJSON(),buttons:[...node.querySelectorAll('button')].map(b=>({text:b.textContent,rect:b.getBoundingClientRect().toJSON()}))})));await page.screenshot({path:'/tmp/harness-refactor-frame-before-focus.png'});
 await page.getByRole('button',{name:'专注',exact:true}).click();assert.equal(await page.locator('iframe[title="Buildr Harness"]').getAttribute('data-acceptance-identity'),'retained');assert.equal(await input.inputValue(),'不会发送的验收草稿');
 await page.getByRole('button',{name:'退出专注',exact:true}).click();assert.equal(await input.inputValue(),'不会发送的验收草稿');
 await page.getByRole('button',{name:'收起',exact:true}).click();await page.locator('#global-conversations-entry').click();assert.equal(await input.inputValue(),'不会发送的验收草稿');
 await page.locator('.development-harness-frame>header').getByRole('button',{name:'设置',exact:true}).click();await frame.getByRole('tab',{name:'智能体',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['authenticated-frame','same-complete-web','workspace-selection','embedded-focused-draft-retention','exact-window-message-check','settings-in-frame'],realModelCalls:0}));
}finally{await browser.close();await app.shutdown();await runtimeProvide(runtime,AGENT_SERVICE_APPLICATION).close();await stopAgentProcess({dataRoot:process.env.BUILDR_APP_DATA_DIR!,mode:'stop-owned'});}
