import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { ConversationWebhooks } from '../../src/application/conversation-webhooks.ts';
import { ConversationEvents } from '../../src/application/conversation-events.ts';
import type { ServiceEvent, RunView } from '../../src/contracts.ts';

const env = { BUILDR_AGENT_WEBHOOK_URL: 'https://notify.example.test', BUILDR_AGENT_WEBHOOK_SECRET: 'private-test-key' };
function change(status = 'running', request?: 'approval' | 'question'): Omit<ServiceEvent, 'cursor' | 'generation'> {
  return { type: 'conversation', revision: '1', payload: { conversation: {
    id: 'conversation', workspaceId: 'workspace', cwd: '/', title: 'sensitive title', revision: `${status}:${request ?? ''}`, hidden: false,
    updatedAt: '2026-11-03T00:00:00.000Z', participants: [], entries: [],
    run: { id: 'run', status } as RunView,
    requests: request ? [{ id: 'request', kind: request, title: 'sensitive question', runId: 'run', conversationId: 'conversation', workspaceId: 'workspace', participantId: 'p', generation: 'g' }] : [],
  } } };
}

test('configuration is opt-in and rejects unsafe URLs and invalid header secrets', () => {
  for (const value of [{}, { ...env, BUILDR_AGENT_WEBHOOK_SECRET: '' }, { ...env, BUILDR_AGENT_WEBHOOK_URL: 'file:///tmp/test' },
    { ...env, BUILDR_AGENT_WEBHOOK_URL: 'https://user:password@example.test' }, { ...env, BUILDR_AGENT_WEBHOOK_SECRET: 'key\r\nheader' }]) {
    assert.equal(ConversationWebhooks.configure(value), undefined);
  }
});

test('event outlet maps four types, deduplicates and sends only safe JSON', async () => {
  const sent: RequestInit[] = [];
  const hook = ConversationWebhooks.configure(env, async (_url, init) => { sent.push(init!); return new Response(null, { status: 204 }); })!;
  const events = new ConversationEvents('g', hook);
  events.publish(change());
  for (const event of [change('completed'), change('failed'), change('waiting-question', 'question'), change('waiting-approval', 'approval')]) {
    events.publish(event); events.publish(event);
  }
  await setImmediate();
  const legacy = sent.filter(init => JSON.parse(String(init.body)).eventType !== 'conversation_updated');
  assert.equal(legacy.length, 4);
  assert.equal(sent.length, 9);
  assert.deepEqual(legacy.map(init => JSON.parse(String(init.body)).eventType), ['completed', 'error', 'pending_question', 'pending_approval']);
  for (const init of sent) {
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
    assert.equal((init.headers as Record<string,string>).authorization, 'Bearer private-test-key');
    const body = JSON.parse(String(init.body));
    assert.equal(body.workspaceId, 'workspace'); assert.equal(body.conversationId, 'conversation');
    assert.equal(body.timestamp, '2026-11-03T00:00:00.000Z'); assert.equal(body.eventId.length, 64);
    if (body.eventType !== 'conversation_updated') assert.ok(!String(init.body).includes('sensitive')); assert.ok(!String(init.body).includes(env.BUILDR_AGENT_WEBHOOK_SECRET));
  }
  events.close();
});

test('transport failures and HTTP errors never escape or retry', async () => {
  for (const transport of [async () => { throw new Error('private failure'); }, async () => new Response(null, { status: 500 })]) {
    let attempts = 0;
    const hook = ConversationWebhooks.configure(env, async () => { attempts++; return transport(); })!;
    hook.publish(change('completed')); await setImmediate(); hook.publish(change('completed')); await setImmediate();
    assert.equal(attempts, 2); hook.close();
  }
});

test('concurrency is bounded and shutdown aborts active requests', () => {
  const signals: AbortSignal[] = [];
  const hook = ConversationWebhooks.configure(env, async (_url, init) => {
    signals.push(init!.signal!); return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
  })!;
  for (let i = 0; i < 20; i++) { const event = change('completed'); event.payload.conversation!.run!.id = String(i); event.payload.conversation!.revision = String(i); hook.publish(event); }
  assert.equal(signals.length, 16); hook.close(); assert.ok(signals.every(signal => signal.aborted));
  hook.publish(change('failed')); assert.equal(signals.length, 16);
});


test('all process revisions include run transitions, messages and card closure without tool bodies', async () => {
  const sent: any[] = [];
  const hook = ConversationWebhooks.configure(env, async (_url, init) => { sent.push(JSON.parse(String(init!.body))); return new Response(null); })!;
  let revision = 0;
  const publish = (status: string, request?: 'question') => {
    const event = change(status, request);
    event.payload.conversation!.revision = String(++revision);
    return event;
  };
  const first = publish('starting');
  first.payload.conversation!.entries = [{id:'old',sequence:1,kind:'message',role:'assistant',text:'old history',createdAt:'2020-01-01'}];
  hook.publish(first);
  const running = publish('running');
  running.payload.conversation!.entries = [
    {id:'goal',sequence:2,kind:'message',role:'user',text:'user goal',createdAt:new Date().toISOString()},
    {id:'reply',sequence:3,kind:'message',role:'assistant',status:'running',text:'progress '+env.BUILDR_AGENT_WEBHOOK_SECRET,createdAt:new Date().toISOString()},
    {id:'thinking',sequence:4,kind:'message',role:'assistant',thinking:true,text:'private thoughts',createdAt:new Date().toISOString()},
    {id:'tool',sequence:5,kind:'tool',role:'system',input:'private command',text:'private output',status:'running',createdAt:new Date().toISOString()},
  ];
  hook.publish(running);hook.publish(running);
  const waiting = publish('waiting-question','question');hook.publish(waiting);
  const answered = publish('running');hook.publish(answered);
  hook.publish(publish('stopping'));hook.publish(publish('stopped'));
  await setImmediate();
  const updates = sent.filter(item => item.eventType === 'conversation_updated');
  assert.deepEqual(updates.map(item => item.runs[0].status), ['starting','running','waiting-question','running','stopping','stopped']);
  assert.equal(updates[0].entries.length,0);
  assert.equal(updates[1].entries.length,3);
  assert.equal(updates[1].entries[0].text,'user goal');
  assert.equal(updates[1].entries[1].text,'progress [REDACTED]');
  assert.equal(updates[2].requests[0].title,'sensitive question');
  assert.deepEqual(updates[3].closedRequests,[{runId:'run',requestId:'request',status:'closed'}]);
  assert.deepEqual(updates.map(item => item.sequence),[1,2,3,4,5,6]);
  assert.equal(new Set(updates.map(item => item.eventId)).size,6);
  assert.ok(!JSON.stringify(sent).includes('private thoughts'));
  assert.ok(!JSON.stringify(sent).includes('private command'));
  assert.ok(!JSON.stringify(sent).includes('private output'));
  assert.ok(!JSON.stringify(sent).includes(env.BUILDR_AGENT_WEBHOOK_SECRET));
  hook.close();
});

test('streaming reply changes and same-status control changes are observable', async () => {
  const sent: any[]=[];
  const hook=ConversationWebhooks.configure(env,async(_url,init)=>{sent.push(JSON.parse(String(init!.body)));return new Response(null);})!;
  const event=change('running');hook.publish(event);
  event.payload.conversation!.entries=[{id:'reply',sequence:1,kind:'message',role:'assistant',text:'first',createdAt:new Date().toISOString()}];
  event.payload.conversation!.revision='2';hook.publish(event);
  event.payload.conversation!.entries[0]!.text='first second';
  event.payload.conversation!.revision='3';hook.publish(event);
  event.payload.conversation!.run!.stopRequested=true;
  event.payload.conversation!.revision='4';hook.publish(event);
  await setImmediate();
  assert.equal(sent[2].entries[0].text,'first second');
  assert.equal(sent[3].runs[0].stopRequested,true);
  assert.equal(sent[3].entries.length,0);
  hook.close();
});

test('burst queue drains with bounded concurrency and drops only beyond capacity', async () => {
  const bodies: any[]=[];
  const releases: Array<() => void>=[];
  const hook=ConversationWebhooks.configure(env,async(_url,init)=>{
    bodies.push(JSON.parse(String(init!.body)));
    return new Promise<Response>(resolve=>{releases.push(()=>resolve(new Response(null)));});
  })!;
  for(let i=0;i<530;i++) {
    const event=change('running');event.payload.conversation!.revision=String(i);hook.publish(event);
  }
  assert.equal(bodies.length,16);
  for(let i=0;i<40;i++){releases.splice(0).forEach(release=>release());await setImmediate();}
  assert.equal(bodies.length,528);
  assert.equal(new Set(bodies.map(body=>body.eventId)).size,528);
  hook.close();
});


test('formal card answers carry answer and acceptance, never copied approval commands', async () => {
  const sent: any[]=[];
  const hook=ConversationWebhooks.configure(env,async(_url,init)=>{sent.push(JSON.parse(String(init!.body)));return new Response(null);})!;
  const event=change('running');hook.publish(event);
  event.payload.conversation!.entries=[{id:'reply-request',sequence:1,kind:'notice',role:'user',status:'sending',
    text:JSON.stringify({'请求标识':'request','回答':'chosen answer','问题':'private approval command'}),createdAt:new Date().toISOString()}];
  event.payload.conversation!.revision='2';hook.publish(event);
  event.payload.conversation!.entries[0]!.status='accepted';event.payload.conversation!.revision='3';hook.publish(event);
  await setImmediate();
  assert.equal(sent[1].entries[0].answer,'chosen answer');
  assert.equal(sent[1].entries[0].requestId,'request');
  assert.equal(sent[2].entries[0].status,'accepted');
  assert.ok(!JSON.stringify(sent).includes('private approval command'));
  hook.close();
});


test('independent pending-send revision changes are not swallowed by conversation revision dedup', async () => {
  const sent: any[]=[];
  const hook=ConversationWebhooks.configure(env,async(_url,init)=>{sent.push(JSON.parse(String(init!.body)));return new Response(null);})!;
  const event=change('running');hook.publish(event);
  event.payload.conversation!.pendingSend={id:'pending',revision:'pending-1',state:'waiting',draft:{text:'next user goal'},reason:'busy',createdAt:'now',updatedAt:'now'} as any;
  hook.publish(event);hook.publish(event);
  delete event.payload.conversation!.pendingSend;event.payload.conversation!.revision='new';hook.publish(event);
  await setImmediate();
  assert.equal(sent.length,3);assert.equal(sent[1].pendingSend.text,'next user goal');assert.equal(sent[2].pendingSend,null);
  hook.close();
});
