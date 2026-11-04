import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutorEventStream } from '../../src/executors/event-stream.ts';
import type { ExecutorEvent } from '../../src/contracts.ts';

test('a burst retains the latest complete text and immediately crosses tool/terminal barriers', () => {
  const delivered: ExecutorEvent[] = []; let scheduled: (() => void) | undefined;
  const stream = new ExecutorEventStream(event => delivered.push(event), flush => { scheduled = flush; return () => { scheduled = undefined; }; });
  const observation: ExecutorEvent = { type:'observation', observation:{status:'running',executionRef:{id:'run'},tools:[]} };
  stream.push(observation);
  for(let i=1;i<=10000;i++) {
    stream.push({type:'item',item:{id:'answer',executionId:'run',kind:'message',role:'assistant',status:'running',text:'完整文字 '+i}});
    stream.push(observation);
  }
  assert.equal(delivered.length,1);
  const tool: ExecutorEvent={type:'item',item:{id:'tool',executionId:'run',kind:'tool',role:'system',status:'running',text:'read'}};
  stream.push(tool);
  assert.equal(scheduled,undefined);
  assert.deepEqual(delivered.map(event=>event.type==='item'?event.item.text:event.type),['observation','完整文字 10000','read']);
  stream.push({type:'completed',status:'completed'});
  assert.equal(delivered.at(-1)!.type,'completed');
});

test('scheduled delivery preserves separate messages, child sources and changed tool states',()=>{
  const delivered: ExecutorEvent[]=[];let flush:()=>void=()=>{};
  const stream=new ExecutorEventStream(event=>delivered.push(event),callback=>{flush=callback;return()=>{};});
  const item=(id:string,parentToolId?:string):ExecutorEvent=>({type:'item',item:{id,parentToolId,executionId:'run',kind:'message',role:'assistant',status:'running',text:id}});
  stream.push(item('one'));stream.push(item('two'));assert.equal(delivered.length,1);flush();assert.equal(delivered.length,2);
  stream.push(item('same','child'));stream.push(item('same'));assert.equal(delivered.length,3);
  stream.push({type:'observation',observation:{status:'running',tools:[{id:'t',label:'tool',status:'completed'}]}});
  assert.equal(delivered.length,5);stream.flush();assert.equal(delivered.length,5);
});

test('native tool bursts retain their latest output and flush before completion or a different call',()=>{
 const delivered:ExecutorEvent[]=[];let flush=()=>{};
 const stream=new ExecutorEventStream(event=>delivered.push(event),callback=>{flush=callback;return()=>{};});
 const item=(id:string,text:string,status:'running'|'completed'='running'):ExecutorEvent=>({type:'item',item:{id,kind:'tool',role:'system',nativeTool:true,executionId:'run',status,text}});
 for(let i=0;i<1000;i++)stream.push(item('command','output '+i));
 assert.equal(delivered.length,0);
 stream.push(item('command','final','completed'));
 assert.deepEqual(delivered.map(e=>e.type==='item'?e.item.text:''),['output 999','final']);
 stream.push(item('first','first output'));stream.push(item('second','second output'));
 assert.equal(delivered.length,3);flush();assert.equal(delivered.length,4);
});
