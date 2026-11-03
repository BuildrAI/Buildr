import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { once } from 'node:events';
import { webhookConfiguration } from '../../src/application/webhook-configuration.ts';
import { ConversationWebhooks } from '../../src/application/conversation-webhooks.ts';

test('unified private config takes precedence, fails closed and supports legacy opt-in', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-webhook-config-'));
  const filename = path.join(root, '.buildr-webhook.json');
  const legacy = {HOME:root,BUILDR_AGENT_WEBHOOK_URL:'https://legacy.test',BUILDR_AGENT_WEBHOOK_SECRET:'legacy-test-secret'};
  try {
    assert.deepEqual(webhookConfiguration(legacy),legacy);
    assert.deepEqual(webhookConfiguration({...legacy,BUILDR_AGENT_WEBHOOK_CONFIG:filename}),{});
    fs.writeFileSync(filename,JSON.stringify({url:'https://current.test',secret:'current-test-secret'}),{mode:0o600});
    assert.deepEqual(webhookConfiguration(legacy),{BUILDR_AGENT_WEBHOOK_URL:'https://current.test',BUILDR_AGENT_WEBHOOK_SECRET:'current-test-secret'});
    const configured=ConversationWebhooks.configure(webhookConfiguration(legacy));assert.ok(configured);configured.close();
    assert.deepEqual(webhookConfiguration({...legacy,HOME:'/not-used',BUILDR_HOST_HOME:root}),webhookConfiguration(legacy));
    fs.chmodSync(filename,0o644);assert.deepEqual(webhookConfiguration(legacy),{});
    fs.chmodSync(filename,0o600);
    for(const body of ['invalid',JSON.stringify([]),JSON.stringify({url:'https://current.test'}),JSON.stringify({url:7,secret:'secret'}),' '.repeat(65537)]) {
      fs.writeFileSync(filename,body);assert.deepEqual(webhookConfiguration(legacy),{});
    }
    fs.unlinkSync(filename);
    const target=path.join(root,'target.json');fs.writeFileSync(target,'{}',{mode:0o600});fs.symlinkSync(target,filename);
    assert.deepEqual(webhookConfiguration(legacy),{});
    fs.unlinkSync(filename);fs.mkdirSync(filename);assert.deepEqual(webhookConfiguration(legacy),{});
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('service composition loads unified config and publishes actual conversation changes', async () => {
  const {createServer}=await import('node:http');
  const {createAgentService}=await import('../../src/application/agent-service.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-webhook-service-'));
  const received: any[]=[];
  let arrival!:()=>void;
  const arrived=new Promise<void>(resolve=>{arrival=resolve;});
  const server=createServer(async(request,response)=>{
    let body='';for await(const chunk of request)body+=chunk;
    assert.equal(request.headers.authorization,'Bearer service-test-secret');
    received.push(JSON.parse(body));response.end();if(received.length===2)arrival();
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address() as {port:number};
  fs.writeFileSync(path.join(root,'.buildr-webhook.json'),JSON.stringify({url:`http://127.0.0.1:${address.port}/hook`,secret:'service-test-secret'}),{mode:0o600});
  const service=createAgentService({dataRoot:root,environment:{HOME:root},executors:[],modelProviders:[],resolveWorkspace:()=>({rootPath:root}),assertTask(){throw new Error('must not touch tasks');}});
  try {
    const chat=await service.conversations.create('workspace',{});
    await service.conversations.update('workspace',chat.id,{expectedRevision:chat.revision,title:'updated'});
    await Promise.race([arrived,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('webhook timeout')),2000);timer.unref();})]);
    assert.equal(received.length,2);
    assert.ok(received.every(event=>event.eventType==='status_changed'&&event.conversationId===chat.id));
    assert.notEqual(received[0].revision,received[1].revision);
    const original=received[0];
    assert.deepEqual(service.conversations.replayWebhook('workspace',chat.id,{eventId:original.eventId}),{eventId:original.eventId,queued:true});
    for(let i=0;i<100&&received.length<3;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(received.length,3);assert.deepEqual(received[2],original);
  } finally {
    await service.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('managed configuration is private, revision guarded, reveal-only and preserves secret on disable', async () => {
  const {WebhookSettings}=await import('../../src/application/webhook-settings.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-webhook-settings-'));
  const file=path.join(root,'.buildr-webhook.json');
  const settings=new WebhookSettings({HOME:root});
  try {
    const initial=settings.view(); assert.equal(initial.state,'unconfigured'); assert.equal(initial.writable,true);
    const enabled=settings.save({expectedRevision:initial.revision,enabled:true,url:'https://receiver.test/hook',secret:'private-test-key'});
    assert.equal(enabled.state,'enabled'); assert.equal(enabled.hasSecret,true); assert.equal('secret' in enabled,false);
    assert.equal(fs.statSync(file).mode&0o777,0o600);
    assert.throws(()=>settings.save({expectedRevision:initial.revision,enabled:false,url:enabled.url}),{code:'agent_webhook_conflict'});
    assert.deepEqual(settings.reveal({expectedRevision:enabled.revision}),{secret:'private-test-key'});
    const disabled=settings.save({expectedRevision:enabled.revision,enabled:false,url:enabled.url,secret:''});
    assert.equal(disabled.state,'disabled'); assert.deepEqual(webhookConfiguration({HOME:root}),{});
    assert.equal(settings.reveal({expectedRevision:disabled.revision}).secret,'private-test-key');
    assert.throws(()=>settings.reveal({expectedRevision:enabled.revision}),{code:'agent_webhook_conflict'});
    for(const url of ['file:///tmp/file','https://user:pass@receiver.test','not-url'])assert.throws(()=>settings.save({expectedRevision:disabled.revision,enabled:true,url}),{code:'agent_webhook_invalid'});
    const external=new WebhookSettings({HOME:root,BUILDR_AGENT_WEBHOOK_CONFIG:file});
    assert.equal(external.view().source,'external-file');assert.equal(external.view().writable,false);
    assert.throws(()=>external.save({expectedRevision:external.view().revision,enabled:true,url:enabled.url}),{code:'agent_webhook_readonly'});
    fs.chmodSync(file,0o644);assert.equal(settings.view().state,'invalid');assert.equal(settings.view().writable,false);
    fs.chmodSync(file,0o600);fs.unlinkSync(file);fs.symlinkSync(path.join(root,'other'),file);
    assert.equal(settings.view().state,'invalid');assert.equal(settings.view().writable,false);
    fs.unlinkSync(file);
    const legacy=new WebhookSettings({HOME:root,BUILDR_AGENT_WEBHOOK_URL:'https://legacy.test',BUILDR_AGENT_WEBHOOK_SECRET:'legacy-key'});
    assert.equal(legacy.view().source,'environment');assert.equal(legacy.view().writable,false);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('dynamic management enables, tests once, changes target and disables without restart or backlog transfer', async () => {
  const {WebhookManagement}=await import('../../src/application/webhook-management.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-webhook-management-'));
  const sent:Array<{url:string;init:RequestInit}>=[];
  let status=503;
  const transport:typeof fetch=async (url,init)=>{sent.push({url:String(url),init:init!});return new Response(null,{status});};
  const manager=new WebhookManagement({HOME:root},path.join(root,'agent-service'),()=>[],transport);
  const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
  try {
    let view=manager.read();
    view=manager.save({expectedRevision:view.revision,enabled:true,url:'https://first.test',secret:'test-one'});
    assert.equal(view.state,'enabled');assert.equal(sent.length,0);
    const failed=await manager.test({expectedRevision:view.revision});assert.equal(failed.success,false);assert.equal(failed.status,503);
    assert.equal(sent.length,1);assert.equal(sent[0].init.redirect,'error');assert.equal(new Headers(sent[0].init.headers).get('authorization'),'Bearer test-one');assert.equal(JSON.parse(String(sent[0].init.body)).eventType,'test');assert.ok(JSON.parse(String(sent[0].init.body)).agent.id);
    assert.equal(manager.read().lastDelivery?.success,false);
    const {createAgentService}=await import('../../src/application/agent-service.ts');
    const service=createAgentService({dataRoot:path.join(root,'other'),environment:{HOME:path.join(root,'other')},executors:[],modelProviders:[],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
    try {
      const conversation=await service.conversations.create('workspace',{});
      manager.publish({type:'conversation',workspaceId:'workspace',conversationId:conversation.id,revision:conversation.revision,payload:{conversation}});
      await tick();assert.ok(sent.length>1);
      const oldEvent=JSON.parse(String(sent.at(-1)!.init.body));
      const before=sent.length;
      view=manager.save({expectedRevision:view.revision,enabled:true,url:'https://second.test',secret:'test-two'});
      await tick();assert.equal(sent.length,before,'old target backlog is not delivered to the new target');
      assert.throws(()=>manager.replay('workspace',conversation.id,oldEvent.eventId),{code:'agent_webhook_event_missing'});
      status=204;assert.equal((await manager.test({expectedRevision:view.revision})).success,true);
      assert.equal(sent.at(-1)!.url,'https://second.test');
      view=manager.save({expectedRevision:view.revision,enabled:false,url:view.url});
      await assert.rejects(manager.test({expectedRevision:view.revision}),{code:'agent_webhook_unavailable'});
      const count=sent.length;manager.publish({type:'conversation',workspaceId:'workspace',conversationId:conversation.id,revision:conversation.revision,payload:{conversation}});await tick();assert.equal(sent.length,count);
    } finally {await service.close();}
  } finally {manager.close();fs.rmSync(root,{recursive:true,force:true});}
});
