import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

const CREDENTIAL_ID='cred-edit-1';

/** 编辑入口复用新建表单：预填、保存、冲突提示与撤销凭据无入口。 */
export async function runProgrammaticCredentialEditJourney(fixture:AgentConversationFixture){
 const {page,step,reset,capture,expectedBrowserErrors}=fixture;
 await step('凭据编辑预填当前参数，保存生效并提示修订冲突',async()=>{
  await reset();
  let credential={id:CREDENTIAL_ID,name:'GrokBot',workspaceIds:['workspace'],scopes:['read','execute'] as string[],allowFullAccess:true,revision:'cred-1',createdAt:'2026-11-11T02:00:00Z',revokedAt:null as string|null,tokenFilePath:'/private/grokbot.token'};
  const revoked={...credential,id:'cred-edit-revoked',name:'旧程序',revokedAt:'2026-11-11T03:00:00Z',tokenFilePath:undefined};
  const accessView=()=>({apiUrl:'http://127.0.0.1:4458/api/v1/programmatic',documentationUrl:'http://127.0.0.1:4458/api/v1/programmatic/help',openapiUrl:'http://127.0.0.1:4458/api/v1/programmatic/openapi.json',workspaces:[{id:'workspace',name:'Buildr'}],credentials:[credential,revoked]});
  let updates=0,conflict=false;
  const matcher='**/api/v1/app/programmatic-access**';
  const route=async(route:any)=>{
   const request=route.request(),pathname=new URL(request.url()).pathname;
   if(pathname==='/api/v1/app/programmatic-access'&&request.method()==='GET')return route.fulfill({json:accessView()});
   if(request.method()==='POST'&&pathname==='/api/v1/app/programmatic-access/'+CREDENTIAL_ID+'/update'){
    const body=request.postDataJSON();
    if(conflict){expectedBrowserErrors?.add(request.url());return route.fulfill({status:409,json:{error:{code:'programmatic_revision_conflict',message:'凭据已变化或撤销，请重新读取。'}}});}
    assert.equal(body.expectedRevision,credential.revision);
    updates++;credential={...credential,name:body.name,workspaceIds:body.workspaceIds,scopes:body.scopes,allowFullAccess:body.allowFullAccess,revision:'cred-'+(updates+1)};
    return route.fulfill({json:{credential}});
   }
   return route.fulfill({status:404,json:{error:{code:'unexpected',message:'unexpected '+pathname}}});
  };
  await page.route(matcher,route);
  const drawer=page.getByRole('dialog',{name:/^智能体与模型/});
  const open=async()=>{if(!(await drawer.isVisible()))await page.getByRole('button',{name:'智能体与模型设置',exact:true}).click();await drawer.waitFor();await drawer.getByRole('tab',{name:'程序接入',exact:true}).click();};
  const close=async()=>{await drawer.getByRole('button',{name:'关闭智能体与模型设置',exact:true}).click();await drawer.waitFor({state:'hidden'});await page.locator('.ant-drawer-content-wrapper').waitFor({state:'hidden'});};
  try{
   await open();
   assert.equal(await drawer.getByRole('button',{name:'管理旧程序接入'}).count(),0,'已撤销凭据不提供管理入口');
   await drawer.getByRole('button',{name:'管理GrokBot接入',exact:true}).click();
   await page.getByRole('menuitem',{name:'编辑参数',exact:true}).click();
   const modal=page.getByRole('dialog',{name:/编辑接入程序/});await modal.waitFor();
   assert.equal(await modal.getByLabel('程序凭据名称').inputValue(),'GrokBot');
   assert.equal(await modal.getByRole('checkbox',{name:/执行开发/}).isChecked(),true);
   assert.equal(await modal.getByRole('checkbox',{name:/回答问题/}).isChecked(),false);
   assert.equal(await modal.getByRole('switch',{name:'允许全部授权执行'}).isChecked(),true);
   assert.match(await modal.locator('.ant-select-selection-item').innerText(),/Buildr/);
   await modal.getByLabel('程序凭据名称').fill('GrokBot 办公');
   await modal.getByRole('checkbox',{name:/回答问题/}).click();
   await modal.getByRole('switch',{name:'允许全部授权执行'}).click();
   await capture(page,'programmatic-credential-edit-modal.png');
   await modal.getByRole('button',{name:'保存修改',exact:true}).click();
   await modal.waitFor({state:'hidden'});
   assert.equal(updates,1);
   assert.deepEqual(credential.scopes,['read','execute','answer']);
   assert.equal(credential.allowFullAccess,false);
   await drawer.locator('[data-credential-id="'+CREDENTIAL_ID+'"] h4').filter({hasText:'GrokBot 办公'}).waitFor();
   assert.match(await drawer.locator('[data-credential-id="'+CREDENTIAL_ID+'"] .pas-credential-summary').innerText(),/读取 \/ 执行 \/ 答复/);
   conflict=true;
   await drawer.getByRole('button',{name:'管理GrokBot 办公接入',exact:true}).click();
   await page.getByRole('menuitem',{name:'编辑参数',exact:true}).click();
   await modal.waitFor();
   assert.equal(await modal.getByLabel('程序凭据名称').inputValue(),'GrokBot 办公');
   await modal.getByLabel('程序凭据名称').fill('冲突名称');
   await modal.getByRole('button',{name:'保存修改',exact:true}).click();
   await modal.getByText('凭据已变化或撤销，请重新读取。',{exact:true}).waitFor();
   assert.equal(updates,1,'冲突不产生第二次更新');
   await modal.getByRole('button',{name:/取\s*消/}).click();
   await modal.waitFor({state:'hidden'});
  }finally{if(await drawer.isVisible())await close();await page.unroute(matcher,route);}
 });
}
