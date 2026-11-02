import test from 'node:test';
import assert from 'node:assert/strict';
import {CodeGeneration,type GenerationInput} from '../../src/modules/code/application/code-generation.ts';
const input:GenerationInput={root:'/workspace',modelAccountId:'account',modelId:'model',accountIdentity:'identity',accountRevision:'revision',label:'Model',prompt:'given material',timeoutMs:100,validateResult:async()=>{}};
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('generation forwards the exact selected tier and reasoning without sharing temporary contexts',async()=>{
 const requests:Parameters<ConstructorParameters<typeof CodeGeneration>[0]>[0][]=[];
 const runs=new CodeGeneration(async request=>{requests.push(request);return '{"commitMessage":"ok"}';});
 try{
  const first=runs.start({...input,serviceTier:'fast:128',reasoningEffort:'high'}),second=runs.start(input);await flush();
  assert.deepEqual([requests[0].accountId,requests[0].modelId,requests[0].expectedIdentity,requests[0].expectedRevision,requests[0].serviceTier,requests[0].reasoningEffort],['account','model','identity','revision','fast:128','high']);
  assert.equal(requests[0].agentId,'commit-message');assert.equal(requests[0].conversationId,first.id);assert.equal(requests[0].runId,first.id);
  assert.equal(requests[1].conversationId,second.id);assert.notEqual(first.id,second.id);
  assert.equal(requests[1].reasoningEffort,undefined);assert.equal(requests[1].serviceTier,undefined,'later requests do not inherit earlier temporary settings');
  assert.equal(runs.read(input.root,first.id).status,'succeeded');
 }finally{runs.close();}
});

test('cancel is workspace scoped, aborts only its request and ignores late output',async()=>{
 const pending:Array<{resolve:(text:string)=>void;signal:AbortSignal}>=[];
 const runs=new CodeGeneration(request=>new Promise(resolve=>pending.push({resolve,signal:request.signal})));
 try{
  const first=runs.start(input),second=runs.start(input);
  assert.throws(()=>runs.cancel('/other',first.id),{code:'code_generation_missing'});
  assert.equal(runs.cancel(input.root,first.id).status,'cancelled');assert.equal(pending[0].signal.aborted,true);assert.equal(pending[1].signal.aborted,false);
  pending[0].resolve('{"commitMessage":"late"}');pending[1].resolve('{"commitMessage":"second"}');await flush();
  assert.equal(runs.read(input.root,first.id).output,null);assert.equal(runs.read(input.root,second.id).status,'succeeded');
 }finally{runs.close();}
});

test('deadline covers validation and never publishes late success',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let complete!:()=>void;
 const runs=new CodeGeneration(async()=>'{"commitMessage":"result"}');
 try{const run=runs.start({...input,validateResult:()=>new Promise(resolve=>{complete=resolve;})});await flush();t.mock.timers.tick(100);complete();await flush();
 assert.equal(runs.read(input.root,run.id).status,'failed');assert.equal(runs.read(input.root,run.id).error?.code,'code_commit_message_timeout');assert.equal(runs.read(input.root,run.id).output,null);
 }finally{runs.close();}
});

test('invalid JSON and failed material validation preserve failure without retries',async()=>{
 let calls=0;const runs=new CodeGeneration(async()=>{calls++;return 'not json';});
 try{const run=runs.start(input);await flush();assert.equal(runs.read(input.root,run.id).status,'failed');assert.equal(calls,1);}finally{runs.close();}
});

test('synchronous validation cannot outrun the deadline while timers await the event loop',async t=>{
 let now=1_000;t.mock.method(Date,'now',()=>now);const runs=new CodeGeneration(async()=>'{"commitMessage":"late"}');
 try{const run=runs.start({...input,validateResult:async()=>{now+=input.timeoutMs;}});await flush();assert.equal(runs.read(input.root,run.id).status,'failed');assert.equal(runs.read(input.root,run.id).output,null);}finally{runs.close();}
});
