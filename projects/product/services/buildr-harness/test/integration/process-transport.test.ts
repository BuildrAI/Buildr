import assert from 'node:assert/strict';
import test from 'node:test';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import { authorize, json, listen, privateToken, request, keepEventStreamAlive } from '../../src/process/transport.ts';

test('accepted response finishes before the execution channel closes', { timeout: 10_000 }, async t => {
  // Exceed the socket write buffer so shutdown cannot race an unflushed body.
  const token = privateToken(), payload = 'accepted '.repeat(1_048_576);
  let channel: Awaited<ReturnType<typeof listen>>, closing: Promise<void> | undefined;
  channel = await listen(async (req, res) => {
    authorize(req, token);
    json(res, 200, { payload });
    closing = channel.close();
  });
  t.after(() => channel.close());
  const result = await request(channel.origin, token, '/runtime', { expectedGeneration: 'fixture' });
  assert.equal(result.payload, payload);
  await closing;
});

test('channel close still reclaims an unfinished event stream', { timeout: 10_000 }, async t => {
  const channel = await listen(async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: ready\n\n');
  });
  t.after(() => channel.close());
  const response = await fetch(channel.origin);
  const reader = response.body!.getReader();
  assert.equal((await reader.read()).done, false);
  const ended = reader.read().then(result => result.done, () => true);
  await Promise.all([channel.close(), channel.close()]);
  assert.equal(await ended, true);
  reader.releaseLock();
});

test('a quiet internal event stream emits comments across a long question wait and cleans up', { timeout: 10_000 }, async t => {
  t.mock.timers.enable({apis:['setInterval']});
  let stop=()=>{};
  const channel=await listen(async(_req,res)=>{
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.write('data: {"status":"waiting-question","cursor":1}\n\n');
    stop=keepEventStreamAlive(res);
  });
  const controller=new AbortController();
  const response=await fetch(channel.origin,{signal:controller.signal});
  const reader=response.body!.getReader(),decoder=new TextDecoder();
  try{
    assert.match(decoder.decode((await reader.read()).value),/waiting-question/);
    for(let n=0;n<24;n++){
      t.mock.timers.tick(15_000);
      assert.equal(decoder.decode((await reader.read()).value),': heartbeat\n\n','idle comments keep the HTTP body active without changing the question or event cursor');
    }
    stop();t.mock.timers.tick(60_000);
    controller.abort();
  }finally{stop();controller.abort();await reader.cancel().catch(()=>{});reader.releaseLock();await channel.close();t.mock.timers.reset();}
});

test('control writes never reuse an expired socket after synchronous preparation', {timeout:15_000}, async t=>{
 const child=fork(new URL('./fixtures/idle-control-server.mjs',import.meta.url),[],{stdio:['ignore','ignore','inherit','ipc']});
 t.after(async()=>{if(child.exitCode!==null||child.signalCode!==null)return;const ended=once(child,'exit');child.kill('SIGTERM');await ended;});
 const [port]=await once(child,'message');const origin='http://127.0.0.1:'+port;
 // Two reads fill both idle slots of the former fetch pool. Blocking the client
 // leaves their close events pending while the independent server expires them.
 await request(origin,'fixture','/status');await request(origin,'fixture','/status');
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5500);
 assert.deepEqual(await request(origin,'fixture','/runtime',{mutation:true}),{writes:1});
 assert.deepEqual(await request(origin,'fixture','/status'),{writes:1},'one accepted mutation; no replay');
});
