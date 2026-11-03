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
