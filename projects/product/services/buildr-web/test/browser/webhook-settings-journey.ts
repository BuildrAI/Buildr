import assert from 'node:assert/strict';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

export async function runWebhookSettingsJourney(fixture:AgentConversationFixture){
 const {page,step,reset,capture}=fixture;
 await step('Webhook 配置保存、点击查看密钥、关闭清除与显式测试',async()=>{
  await reset();
  let view={revision:'config-1',source:'private-file',writable:true,state:'unconfigured',url:'',hasSecret:false};
  let stored='',reveals=0,tests=0,saves=0,delay=false,release:(()=>void)|undefined;
  const matcher='**/api/v1/app/agent-service/webhook-settings**';
  const route=async(route:any)=>{
   const request=route.request(),pathname=new URL(request.url()).pathname;
   if(request.method()==='GET')return route.fulfill({json:view});
   const body=request.postDataJSON();assert.equal(body.expectedRevision,view.revision);
   if(pathname.endsWith('/reveal')){reveals++;if(delay)await new Promise<void>(resolve=>{release=resolve;});return route.fulfill({json:{secret:stored}});}
   if(pathname.endsWith('/test')){tests++;return route.fulfill({json:{at:new Date().toISOString(),success:true,kind:'test',status:204}});}
   saves++;stored=body.secret||stored;view={...view,revision:'config-'+(saves+1),state:body.enabled?'enabled':'disabled',url:body.url,hasSecret:!!stored};return route.fulfill({json:view});
  };
  await page.route(matcher,route);
  const drawer=page.getByRole('dialog',{name:/^智能体与模型/});
  const open=async()=>{await page.getByRole('button',{name:'账号与配置',exact:true}).click();await drawer.waitFor();await drawer.getByRole('tab',{name:'事件通知',exact:true}).click();await drawer.locator('#agent-webhook-settings').getByText('配置来源：',{exact:false}).waitFor();};
  const close=async()=>{await drawer.getByRole('button',{name:'关闭智能体账号与配置',exact:true}).click();await drawer.waitFor({state:'hidden'});};
  try{
   await open();assert.equal(reveals,0);assert.equal(await drawer.locator('.ams-accounts').count(),0);assert.equal(await drawer.getByRole('tab',{name:'事件通知',exact:true}).getAttribute('aria-selected'),'true');
   const card=drawer.locator('#agent-webhook-settings');
   await card.locator('#agent-webhook-url').fill('https://receiver.test/hook');
   await card.locator('#agent-webhook-new-secret').fill('browser-private-key');
   assert.equal(await card.getByRole('button',{name:'发送测试通知',exact:true}).isDisabled(),true);
   await card.getByRole('button',{name:'保存配置',exact:true}).click();await card.getByText('通知配置已保存并生效。',{exact:true}).waitFor();
   assert.equal(saves,1);assert.equal(tests,0);assert.equal(reveals,0);assert.equal(await card.locator('#agent-webhook-secret').inputValue(),'••••••••');
   await card.getByRole('button',{name:'查看通知密钥',exact:true}).click();await card.getByRole('button',{name:'隐藏通知密钥',exact:true}).waitFor();assert.equal(await card.locator('#agent-webhook-secret').inputValue(),stored);
   await card.getByRole('button',{name:'隐藏通知密钥',exact:true}).click();assert.equal(await card.locator('#agent-webhook-secret').inputValue(),'••••••••');
   await card.getByRole('button',{name:'发送测试通知',exact:true}).click();await card.getByText('测试通知已成功送达。',{exact:true}).waitFor();assert.equal(tests,1);
   await capture(page,'webhook-settings-hidden.png');await drawer.getByRole('tab',{name:'模型',exact:true}).click();assert.equal(await drawer.locator('#agent-webhook-settings').count(),0);await drawer.getByRole('tab',{name:'事件通知',exact:true}).click();await card.getByText('配置来源：',{exact:false}).waitFor();assert.equal(await card.locator('#agent-webhook-secret').inputValue(),'••••••••');
   delay=true;await card.getByRole('button',{name:'查看通知密钥',exact:true}).click();await page.waitForFunction(()=>true);for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(release);
   await close();release!();release=undefined;delay=false;await open();assert.equal(await drawer.locator('#agent-webhook-secret').inputValue(),'••••••••');assert.equal(reveals,2);
   await drawer.locator('#agent-webhook-settings').getByRole('switch').click();await drawer.getByRole('button',{name:'保存配置',exact:true}).click();await drawer.getByText('通知配置已保存并生效。',{exact:true}).waitFor();assert.equal(view.state,'disabled');assert.equal(stored,'browser-private-key');
  }finally{release?.();if(await drawer.isVisible())await close();await page.unroute(matcher,route);}
 });
}
