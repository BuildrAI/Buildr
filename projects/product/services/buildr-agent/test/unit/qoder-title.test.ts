import assert from 'node:assert/strict';
import test from 'node:test';
import {generateQoderTitle,qoderTitleBudget} from '../../src/executors/qoder/title.ts';
import {bounded} from '../../src/executors/native-process.ts';

test('Qoder title accepts a valid response beyond the former ten-second cutoff',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const calls:Array<{method:string;params:any}>=[];
  const rpc={async call(method:string,params:any,timeout?:number){calls.push({method,params});if(method==='cancelTitle')return undefined;return await bounded(new Promise<string>(resolve=>setTimeout(()=>resolve('超过旧门槛仍有效的标题'),11_000)),timeout!);}};
  try{const pending=generateQoderTitle(rpc,'quoted description',new AbortController().signal);t.mock.timers.tick(11_000);assert.equal(await pending,'超过旧门槛仍有效的标题');assert.deepEqual(calls.map(c=>c.method),['title']);}finally{t.mock.timers.reset();}
});

test('Qoder title total timeout cancels the exact auxiliary request with a title-specific diagnostic',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const calls:Array<{method:string;params:any}>=[];
  const rpc={async call(method:string,params:any,timeout?:number){calls.push({method,params});if(method==='cancelTitle')return {};return await bounded(new Promise(()=>{}),timeout!);}};
  try{const pending=generateQoderTitle(rpc,'quoted description',new AbortController().signal);const failed=assert.rejects(pending,/^Error: agent_title_timeout$/);t.mock.timers.tick(qoderTitleBudget.rpcMs);await failed;assert.deepEqual(calls.map(c=>c.method),['title','cancelTitle']);assert.equal(calls[1].params.requestId,calls[0].params.requestId);}finally{t.mock.timers.reset();}
});

test('Qoder title cancellation is scoped and a pre-aborted request never dispatches',async()=>{
  const calls:Array<{method:string;params:any}>=[];const rpc={async call(method:string,params:any){calls.push({method,params});return method==='title'?await new Promise(()=>{}):{};}};
  const controller=new AbortController();const pending=generateQoderTitle(rpc,'quoted description',controller.signal);const failed=assert.rejects(pending,/agent_title_cancelled/);controller.abort();await failed;
  assert.deepEqual(calls.map(c=>c.method),['title','cancelTitle']);assert.equal(calls[1].params.requestId,calls[0].params.requestId);
  await assert.rejects(generateQoderTitle(rpc,'another description',controller.signal),/agent_title_cancelled/);assert.equal(calls.length,2);
});

test('Qoder title does not claim cancellation when auxiliary cleanup is unconfirmed',async()=>{
  const rpc={async call(method:string){if(method==='cancelTitle')throw new Error('agent_native_timeout');return await new Promise(()=>{});}};
  const controller=new AbortController();const pending=generateQoderTitle(rpc,'quoted description',controller.signal);const failed=assert.rejects(pending,/agent_title_cleanup_unconfirmed/);controller.abort();await failed;
});
