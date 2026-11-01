import assert from 'node:assert/strict';
import test from 'node:test';
import {generateQoderTitle,qoderTitleBudget,qoderTitleMatchText} from '../../src/executors/qoder/title.ts';
import {bounded} from '../../src/executors/native-process.ts';

test('Qoder title request carries the exact session identity, bounded summary and early user input',async()=>{
  const calls:Array<{method:string;params:any}>=[];const rpc={async call(method:string,params:any){calls.push({method,params});return method==='title'?'供应商入驻审核流程梳理':{};}};
  assert.equal(await generateQoderTitle(rpc,'context-one','/work/space','{"messages":[]}','请梳理供应商入驻业务',new AbortController().signal),'供应商入驻审核流程梳理');
  assert.deepEqual(calls.map(call=>call.method),['title']);
  assert.equal(calls[0]!.params.contextId,'context-one');assert.equal(calls[0]!.params.cwd,'/work/space');assert.equal(calls[0]!.params.description,'{"messages":[]}');assert.equal(calls[0]!.params.userText,'请梳理供应商入驻业务');
  await generateQoderTitle(rpc,'context-one','/work/space','{"messages":[]}',undefined,new AbortController().signal);
  assert.equal(calls[1]!.params.contextId,'context-one');assert.equal(calls[1]!.params.description,'{"messages":[]}');assert.ok(!('userText' in calls[1]!.params));
});

test('Qoder title match text mirrors qodercli whitespace and leading context normalization',()=>{
  assert.equal(qoderTitleMatchText('第一行\n  第二行\t第三行'),'第一行 第二行 第三行');
  assert.equal(qoderTitleMatchText('<system-reminder>ignored\ncontext</system-reminder>真实要求'),'真实要求');
  assert.equal(qoderTitleMatchText('<loaded_context>a</loaded_context><hook_context>b\nc</hook_context> 真实要求'),'真实要求');
  assert.equal(qoderTitleMatchText('<local-command-caveat>caveat</local-command-caveat>真实要求'),'真实要求');
  assert.equal(qoderTitleMatchText('  <unknown>保留</unknown>  '),'<unknown>保留</unknown>');
});

test('Qoder title accepts a valid response beyond the former ten-second cutoff',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const calls:Array<{method:string;params:any}>=[];
  const rpc={async call(method:string,params:any,timeout?:number){calls.push({method,params});if(method==='cancelTitle')return undefined;return await bounded(new Promise<string>(resolve=>setTimeout(()=>resolve('超过旧门槛仍有效的标题'),11_000)),timeout!);}};
  try{const pending=generateQoderTitle(rpc,'context-one','/work/space','{"messages":[]}','原始用户输入',new AbortController().signal);t.mock.timers.tick(11_000);assert.equal(await pending,'超过旧门槛仍有效的标题');assert.deepEqual(calls.map(c=>c.method),['title']);}finally{t.mock.timers.reset();}
});

test('Qoder title total timeout cancels the exact auxiliary request with a title-specific diagnostic',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const calls:Array<{method:string;params:any}>=[];
  const rpc={async call(method:string,params:any,timeout?:number){calls.push({method,params});if(method==='cancelTitle')return {};return await bounded(new Promise(()=>{}),timeout!);}};
  try{const pending=generateQoderTitle(rpc,'context-one','/work/space','{"messages":[]}',undefined,new AbortController().signal);const failed=assert.rejects(pending,/^Error: agent_title_timeout$/);t.mock.timers.tick(qoderTitleBudget.rpcMs);await failed;assert.deepEqual(calls.map(c=>c.method),['title','cancelTitle']);assert.equal(calls[1].params.requestId,calls[0].params.requestId);}finally{t.mock.timers.reset();}
});

test('Qoder title cancellation is scoped and a pre-aborted request never dispatches',async()=>{
  const calls:Array<{method:string;params:any}>=[];const rpc={async call(method:string,params:any){calls.push({method,params});return method==='title'?await new Promise(()=>{}):{};}};
  const controller=new AbortController();const pending=generateQoderTitle(rpc,'context-one','/work/space','{"messages":[]}','原始用户输入',controller.signal);const failed=assert.rejects(pending,/agent_title_cancelled/);controller.abort();await failed;
  assert.deepEqual(calls.map(c=>c.method),['title','cancelTitle']);assert.equal(calls[1].params.requestId,calls[0].params.requestId);
  await assert.rejects(generateQoderTitle(rpc,'context-one','/work/space','{"messages":[]}','另一个用户输入',controller.signal),/agent_title_cancelled/);assert.equal(calls.length,2);
});

test('Qoder title does not claim cancellation when auxiliary cleanup is unconfirmed',async()=>{
  const rpc={async call(method:string){if(method==='cancelTitle')throw new Error('agent_native_timeout');return await new Promise(()=>{});}};
  const controller=new AbortController();const pending=generateQoderTitle(rpc,'context-one','/work/space','{"messages":[]}',undefined,controller.signal);const failed=assert.rejects(pending,/agent_title_cleanup_unconfirmed/);controller.abort();await failed;
});
