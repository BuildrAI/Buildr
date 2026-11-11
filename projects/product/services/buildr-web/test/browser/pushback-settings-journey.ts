import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

const CREDENTIAL_ID='cred-pushback-1';
const PREFIX=`programmatic-pushback-${CREDENTIAL_ID}`;

export async function runPushbackSettingsJourney(fixture:AgentConversationFixture){
 const {page,step,reset,capture}=fixture;
 await step('凭据回推配置保存、点击查看密钥、收起清除与显式测试',async()=>{
  await reset();
  const credential={id:CREDENTIAL_ID,name:'GrokBot',workspaceIds:['workspace'],scopes:['read','execute'],revision:'cred-1',createdAt:'2026-11-11T02:00:00Z',revokedAt:null,tokenFilePath:'/private/grokbot.token'};
  const accessView={apiUrl:'http://127.0.0.1:4458/api/v1/programmatic',documentationUrl:'http://127.0.0.1:4458/api/v1/programmatic/help',openapiUrl:'http://127.0.0.1:4458/api/v1/programmatic/openapi.json',workspaces:[{id:'workspace',name:'Buildr'}],credentials:[credential]};
  let view={credentialId:CREDENTIAL_ID,revision:'pushback-1',state:'unconfigured',url:'',hasSecret:false,rateLimitHour:180,rateLimitMinute:20};
  let stored='',reveals=0,tests=0,saves=0,delay=false,release:(()=>void)|undefined;
  const matcher='**/api/v1/app/programmatic-access**';
  const route=async(route:any)=>{
   const request=route.request(),pathname=new URL(request.url()).pathname;
   if(pathname==='/api/v1/app/programmatic-access')return route.fulfill({json:accessView});
   if(request.method()==='GET')return route.fulfill({json:view});
   const body=request.postDataJSON();assert.equal(body.expectedRevision,view.revision);
   if(pathname.endsWith('/reveal')){reveals++;if(delay)await new Promise<void>(resolve=>{release=resolve;});return route.fulfill({json:{secret:stored}});}
   if(pathname.endsWith('/test')){tests++;return route.fulfill({json:{at:new Date().toISOString(),success:true,kind:'test',status:204}});}
   saves++;stored=body.secret||stored;view={...view,revision:'pushback-'+(saves+1),state:body.enabled?'enabled':'disabled',url:body.url,hasSecret:!!stored,rateLimitHour:body.rateLimitHour,rateLimitMinute:body.rateLimitMinute};return route.fulfill({json:view});
  };
  await page.route(matcher,route);
  const drawer=page.getByRole('dialog',{name:/^智能体与模型/});
  const card=drawer.locator('#'+PREFIX);
  const open=async()=>{if(!(await drawer.isVisible()))await page.getByRole('button',{name:'账号与配置',exact:true}).click();await drawer.waitFor();await drawer.getByRole('tab',{name:'程序接入',exact:true}).click();await drawer.getByRole('button',{name:'查看GrokBot接入详情',exact:true}).click();await card.waitFor();};
  const collapse=async()=>{await drawer.getByRole('button',{name:'收起GrokBot接入详情',exact:true}).click();await card.waitFor({state:'hidden'});};
  const close=async()=>{await drawer.getByRole('button',{name:'关闭智能体账号与配置',exact:true}).click();await drawer.waitFor({state:'hidden'});await page.locator('.ant-drawer-content-wrapper').waitFor({state:'hidden'});};
  try{
   await open();assert.equal(reveals,0);assert.equal(saves,0);
   assert.equal(await drawer.getByRole('tab',{name:'事件通知',exact:true}).count(),0,'全局事件通知页签已移除');
   await card.locator('#'+PREFIX+'-url').fill('https://receiver.test/hook');
   await card.locator('#'+PREFIX+'-new-secret').fill('browser-private-key');
   assert.equal(await card.getByRole('button',{name:'发送测试通知',exact:true}).isDisabled(),true);
   await card.getByRole('button',{name:'保存配置',exact:true}).click();await card.getByText('回推配置已保存并生效。',{exact:true}).waitFor();
   assert.equal(saves,1);assert.equal(tests,0);assert.equal(reveals,0);assert.equal(await card.locator('#'+PREFIX+'-secret').inputValue(),'••••••••');
   await card.getByRole('button',{name:'查看GrokBot回推密钥',exact:true}).click();await card.getByRole('button',{name:'隐藏GrokBot回推密钥',exact:true}).waitFor();assert.equal(await card.locator('#'+PREFIX+'-secret').inputValue(),stored);
   await card.getByRole('button',{name:'隐藏GrokBot回推密钥',exact:true}).click();assert.equal(await card.locator('#'+PREFIX+'-secret').inputValue(),'••••••••');
   await card.getByRole('button',{name:'发送测试通知',exact:true}).click();await card.getByText('测试通知已成功送达。',{exact:true}).waitFor();assert.equal(tests,1);
   await capture(page,'pushback-settings-hidden.png');
   await collapse();await open();assert.equal(await card.locator('#'+PREFIX+'-secret').inputValue(),'••••••••','收起再展开清除明文');assert.equal(reveals,1);
   delay=true;await card.getByRole('button',{name:'查看GrokBot回推密钥',exact:true}).click();await page.waitForFunction(()=>true);for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(release);
   await close();release!();release=undefined;delay=false;await open();assert.equal(await card.locator('#'+PREFIX+'-secret').inputValue(),'••••••••');assert.equal(reveals,2);
   await card.locator('#'+PREFIX+'-rate-hour').fill('300');await card.getByRole('button',{name:'保存配置',exact:true}).click();await card.getByText('回推配置已保存并生效。',{exact:true}).waitFor();assert.equal(view.rateLimitHour,300);
   await card.getByRole('switch').click();await card.getByRole('button',{name:'保存配置',exact:true}).click();await card.getByText('回推配置已保存并生效。',{exact:true}).waitFor();assert.equal(view.state,'disabled');assert.equal(stored,'browser-private-key');
  }finally{release?.();if(await drawer.isVisible())await close();await page.unroute(matcher,route);}
 });
}
