import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseQuestionWait } from '../../src/application/question-wait-release.ts';
import type { AgentRuntime, ExecutorObservation } from '../../src/contracts.ts';
const input={contextRef:{id:'context'},executionRef:{id:'execution'},requestIds:['question']};
const waiting:ExecutorObservation={status:'waiting',executionRef:input.executionRef,requests:[{id:'question',kind:'question',title:'Continue?'}],tools:[]};
for(const change of [{status:'running'},{status:'unknown'},{executionRef:{id:'another'}},{backgroundWork:true},{tools:[{id:'tool',label:'work',status:'running'}]},{tools:[{id:'tool',label:'work',status:'unknown'}]},{requests:[{id:'approval',kind:'approval',title:'Allow?'}]},{requests:[{id:'other',kind:'question',title:'Other?'}]},{requests:undefined}])test('generic release refuses unsafe observation '+JSON.stringify(change),async()=>{
 let stops=0,effects=0;const runtime={observe:async()=>({...waiting,...change}),stop:async()=>{stops++;return waiting;}} as unknown as AgentRuntime;
 assert.equal(await releaseQuestionWait(runtime,input,()=>{effects++;}),undefined);assert.equal(stops,0);assert.equal(effects,0);
});
test('service fallback stops only a proven question wait, after durable intent callback',async()=>{const calls:string[]=[];const runtime={observe:async()=>waiting,stop:async()=>{calls.push('stop');return {...waiting,status:'stopped' as const};}} as unknown as AgentRuntime;assert.equal((await releaseQuestionWait(runtime,input,()=>{calls.push('intent');}))?.status,'stopped');assert.deepEqual(calls,['intent','stop']);});
test('native primitive handles a nonblocking question without the generic stop',async()=>{const calls:string[]=[];const runtime={observe:async()=>({...waiting,status:'running'}),endQuestionWait:async()=>{calls.push('native');return {...waiting,status:'stopped'};},stop:async()=>{assert.fail('must not stop background tools');}} as unknown as AgentRuntime;await releaseQuestionWait(runtime,input,()=>{calls.push('intent');});assert.deepEqual(calls,['intent','native']);});
test('a version or reply conflict before the effect prevents all native dispatch',async()=>{let stops=0;const runtime={observe:async()=>waiting,stop:async()=>{stops++;return waiting;}} as unknown as AgentRuntime;await assert.rejects(releaseQuestionWait(runtime,input,()=>{throw new Error('changed');}),/changed/);assert.equal(stops,0);});
