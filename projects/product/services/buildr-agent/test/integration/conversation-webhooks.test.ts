import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { ConversationWebhooks } from '../../src/application/conversation-webhooks.ts';
import type { ConversationView, RunView } from '../../src/contracts.ts';

test('real localhost HTTP receives authenticated JSON once and does not follow redirects', async () => {
  const received: Array<{ url?: string; auth?: string; body: any }> = [];
  let notify!: () => void;
  const arrival = new Promise<void>(resolve => { notify = resolve; });
  const server = createServer(async (request, response) => {
    let data = ''; for await (const chunk of request) data += chunk;
    received.push({ url: request.url, auth: request.headers.authorization, body: JSON.parse(data) });
    response.writeHead(302, { location: '/must-not-follow' }); response.end(); if (received.length === 2) notify();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as { port: number };
  const hook = ConversationWebhooks.configure({ BUILDR_AGENT_WEBHOOK_URL: `http://127.0.0.1:${address.port}/hook`, BUILDR_AGENT_WEBHOOK_SECRET: 'http-test-secret' })!;
  try {
    const view: ConversationView = { id: 'c', workspaceId: 'w', cwd: '/', title: 'test', revision: '1', hidden: false, participants: [], entries: [], updatedAt: '2026-11-03T00:00:00Z', requests: [], run: { id: 'r', status: 'completed' } as RunView };
    const event = { type: 'conversation' as const, revision: '1', payload: { conversation: view } };
    hook.publish(event); hook.publish(event);
    await Promise.race([arrival, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('HTTP timeout')), 2000); timer.unref(); })]);
    assert.equal(received.length, 2);
    for (const item of received) assert.deepEqual(item.body.agent, { name: 'Buildr', id: 'buildr' }); assert.equal(received[0]!.url, '/hook');
    assert.equal(received[0]!.auth, 'Bearer http-test-secret');
    assert.deepEqual(received.map(item => item.body.eventType).sort(), ['completed', 'conversation_updated']); assert.equal(received[0]!.body.conversationId, 'c');
  } finally { hook.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('real HTTP coalesces 200 reply fragments into one completed reply', async () => {
  const received: any[]=[];
  let notify!:()=>void;
  const arrival=new Promise<void>(resolve=>{notify=resolve;});
  const server=createServer(async(request,response)=>{
    let data='';for await(const chunk of request)data+=chunk;
    received.push(JSON.parse(data));response.end();if(received.length===3)notify();
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address() as {port:number};
  const hook=ConversationWebhooks.configure({BUILDR_AGENT_WEBHOOK_URL:`http://127.0.0.1:${address.port}`,BUILDR_AGENT_WEBHOOK_SECRET:'local-test-secret'})!;
  try {
    const view:ConversationView={id:'c',workspaceId:'w',cwd:'/',title:'test',revision:'0',hidden:false,participants:[],entries:[],updatedAt:new Date().toISOString(),requests:[],run:{id:'r',status:'running'} as RunView};
    const event={type:'conversation' as const,revision:'0',payload:{conversation:view}};hook.publish(event);
    view.entries=[{id:'reply',runId:'r',sequence:1,kind:'message',role:'assistant',status:'running',text:'',createdAt:new Date().toISOString()}];
    for(let i=0;i<200;i++){view.entries[0]!.text+='x';view.revision=String(i+1);hook.publish(event);}
    view.entries[0]!.status='completed';hook.publish(event);hook.publish(event);
    await Promise.race([arrival,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('HTTP timeout')),2000);timer.unref();})]);
    assert.equal(received.length,3);
    assert.equal(received.filter(x=>x.eventType==='conversation_updated').length,2);
    const replies=received.filter(x=>x.eventType==='reply');assert.equal(replies.length,1);
    assert.equal(replies[0].entries[0].text,'x'.repeat(200));
  } finally {hook.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
