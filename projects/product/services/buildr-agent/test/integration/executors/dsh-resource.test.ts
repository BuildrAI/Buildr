import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DshRuntime} from '../../../build/executors/dsh/index.js';
import {OwnedControlResource,closeOwnedProcess} from '../../../build/executors/native-process.js';
import type {ContextRef,ExecutorEvent,ExecutionRef} from '../../../src/contracts.ts';
class Stream {
 values:any[]=[];wait?: (v:IteratorResult<any>)=>void;closed=false;
 push(v:any){if(this.wait){const r=this.wait;this.wait=undefined;r({done:false,value:v});}else this.values.push(v);}
 next():Promise<IteratorResult<any>>{if(this.values.length)return Promise.resolve({done:false,value:this.values.shift()});if(this.closed)return Promise.resolve({done:true,value:undefined});return new Promise(r=>{this.wait=r;});}
 [Symbol.asyncIterator](){return this;}
 dispose(){this.closed=true;this.wait?.({done:true,value:undefined});this.wait=undefined;}
}
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'buildr-dsh-release-'));
 const events=new Map<string,any[]>(),streams=new Map<string,Stream[]>(),jobs:any[]=[];
 const controls:OwnedControlResource[]=[],runtimes:DshRuntime[]=[],sent:string[]=[],jobOwners:string[]=[];
 let jobFailure=false,disposedJobs=0;
 const ok=(value:any)=>({ok:true,value});
 function publish(id:string,event:any){event.seq=(events.get(id)?.length??0)+1;events.get(id)!.push(event);for(const s of streams.get(id)??[])s.push({type:'event',event});}
 function runtime(){
  const control=new OwnedControlResource(process.execPath,['-e','process.stdin.resume();setInterval(()=>{},1000)'],{cwd:root,env:process.env});controls.push(control);
  const remote={
   permissionPresets:{catalog:async()=>ok({defaultPreset:'workspace-write',options:[{value:'workspace-write'}]})},
   commands:{list:async()=>ok([{name:'permission',definitionId:'@deepseek-ai/dsh-permission-presets'}]),execute:async()=>ok({result:{kind:'success'}})},
   job:{list:({sessionId}:{sessionId:string})=>{jobOwners.push(sessionId);if(jobFailure)throw Error('unavailable');const s=new Stream();s.push({type:'rows',jobs:structuredClone(jobs)});const dispose=s.dispose.bind(s);s.dispose=()=>{disposedJobs++;dispose();};return s;}},
   session:{create:async()=>{const id=randomUUID();events.set(id,[]);return ok({sessionId:id});},
    follow:({address}:any)=>{const id=address.sessionId,s=new Stream();const group=streams.get(id)??[];group.push(s);streams.set(id,group);s.push({type:'snapshot',header:{id,cwd:root},cursor:events.get(id)?.length??0,records:[],projections:{values:{permissions:{currentValue:'workspace-write'}}}});return s;},
    page:async({address}:any)=>ok({records:(events.get(address.sessionId)??[]).map(event=>({event})),hasMore:false}),
    prompt:async(input:any)=>{sent.push(input.requestId);queueMicrotask(()=>{publish(input.sessionId,{type:'turn/start',data:{turn:1}});publish(input.sessionId,{type:'user/message',data:{turn:1,id:randomUUID(),source:{rpcId:input.requestId},content:input.content}});});return ok({accepted:true});},
    cancel:async({sessionId}:any)=>{publish(sessionId,{type:'turn/end',data:{turn:1,reason:{kind:'aborted'}}});return ok({accepted:true});}
   }
  };
  const host={control,child:control.child,close:async()=>{for(const group of streams.values())for(const s of group)s.dispose();await closeOwnedProcess(control.child,30);}};
  const rt=Reflect.construct(DshRuntime,['dsh-release-binding',host,{remote,close:async()=>{},ctx:{}}]) as DshRuntime;runtimes.push(rt);
  control.child.once('exit',()=>{for(const group of streams.values())for(const s of group)s.dispose();});
  return rt;
 }
 async function wait(predicate:()=>boolean){for(let i=0;i<300;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('native state did not settle');}
 async function start(rt:DshRuntime){const contextRef=await rt.createContext({cwd:root}),visible:ExecutorEvent[]=[];const requestId=randomUUID();let executionRef:ExecutionRef|undefined;
  const sending=rt.send({contextRef,cwd:root,text:'one operation',images:[],clientRequestId:requestId,onEvent:e=>{visible.push(e);if(e.type==='accepted')executionRef=e.executionRef;}});sending.catch(()=>{});await wait(()=>Boolean(executionRef));return {contextRef,executionRef:executionRef!,visible,sending};}
 const finish=(ref:ContextRef)=>publish(ref.id,{type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});
 return {root,runtime,start,finish,publish,wait,jobs,jobOwners,sent,controls,setJobFailure(v:boolean){jobFailure=v;},disposedJobs:()=>disposedJobs,async close(){for(const rt of runtimes)await rt.close();await rm(root,{recursive:true,force:true});}};
}

test('DSH shares exact control proof and protects native background dependencies',{skip:process.platform==='win32'},async()=>{
 const f=await fixture();try{
  const rt=f.runtime(),run=await f.start(rt);assert.ok(run.executionRef.data?.resourceGroup);assert.equal(await rt.canRelease(run),false,'active native execution still owns the control');
  f.finish(run.contextRef);await run.sending;
  for(const status of ['running','stopping']){f.jobs.splice(0,Infinity,{id:'job-own',owner:run.contextRef.id,status});assert.equal(await rt.canRelease(run),false);}
  f.jobs.splice(0,Infinity,{id:'job-own',owner:run.contextRef.id,status:'completed'});
  assert.deepEqual(await rt.canRelease(run),{executionState:'ended'});assert.ok(f.disposedJobs()>0);assert.ok(f.jobOwners.every(id=>id===run.contextRef.id));
  assert.equal(await rt.canRelease({...run,executionRef:{id:run.executionRef.id}}),false,'missing ownership does not authorize a recovered PID');
  assert.equal(await rt.canRelease({...run,executionRef:{...run.executionRef,id:'other'}}),false);
 }finally{await f.close();}
});

test('DSH job observation failure holds release while ordinary execution still works',{skip:process.platform==='win32'},async()=>{
 const f=await fixture();try{
  f.setJobFailure(true);const rt=f.runtime(),run=await f.start(rt);f.finish(run.contextRef);await run.sending;
  assert.equal(await rt.canRelease(run),false);assert.equal(f.sent.length,1);
  f.setJobFailure(false);assert.deepEqual(await rt.canRelease(run),{executionState:'ended'});
 }finally{await f.close();}
});

test('DSH retains another active native context on the same control resource',{skip:process.platform==='win32'},async()=>{
 const f=await fixture();try{
  const rt=f.runtime(),first=await f.start(rt),other=await f.start(rt);f.finish(first.contextRef);await first.sending;
  assert.equal(await rt.canRelease(first),false);f.finish(other.contextRef);await other.sending;
  assert.deepEqual(await rt.canRelease(first),{executionState:'ended'});assert.equal(f.sent.length,2);
 }finally{await f.close();}
});

test('DSH actual control exit settles a lost observation without completing or replaying its tool',{skip:process.platform==='win32'},async()=>{
 const f=await fixture();try{
  const rt=f.runtime(),run=await f.start(rt);f.publish(run.contextRef.id,{type:'tool/call',data:{turn:1,callId:'uncertain-operation',name:'bash',arguments:'one side effect'}});
  const failed=assert.rejects(run.sending,/dsh_execution_observation_lost/);f.controls[0]!.child.kill('SIGKILL');await failed;
  await f.wait(()=>f.controls[0]!.child.signalCode!==null);
  assert.deepEqual(await rt.canRelease(run),{executionState:'unknown'});assert.equal(f.sent.length,1);assert.ok(!run.visible.some(e=>e.type==='completed'&&e.status==='completed'));
  const cold=f.runtime();await cold.resumeContext({contextRef:run.contextRef,cwd:f.root});const observed=await cold.observe(run);
  assert.equal(observed.status,'unknown');assert.equal(observed.tools[0]?.status,'unknown');assert.deepEqual(observed.executionRef,run.executionRef);
  assert.deepEqual(await cold.canRelease(run),{executionState:'unknown'});assert.equal(f.sent.length,1);
 }finally{await f.close();}
});


test('DSH synthetic unknown-result repair remains unknown in a live observation',{skip:process.platform==='win32'},async()=>{
 const f=await fixture();try{
  const rt=f.runtime(),run=await f.start(rt);f.publish(run.contextRef.id,{type:'tool/call',data:{turn:1,callId:'uncertain-operation',name:'bash'}});
  f.publish(run.contextRef.id,{type:'tool/result',data:{turn:1,error:{code:'TOOL_OUTCOME_UNKNOWN'},message:{toolCallId:'uncertain-operation',isError:true,content:[{type:'text',text:'outcome unknown'}]}}});f.finish(run.contextRef);await run.sending;
  const observed=await rt.observe(run);assert.equal(observed.status,'unknown');assert.equal(observed.tools[0]?.status,'unknown');assert.deepEqual(await rt.canRelease(run),{executionState:'unknown'});assert.equal(f.sent.length,1);
  const received={id:'uncertain-operation',kind:'tool' as const,role:'assistant' as const,text:'real receipt',status:'completed' as const,executionId:'other-execution'};
  assert.equal((await rt.observe({...run,knownItems:[received]})).status,'unknown','another execution cannot confirm this operation');
  assert.equal((await rt.observe({...run,knownItems:[{...received,executionId:run.executionRef.id}]})).status,'idle','an exact already-received completion remains authoritative');
  assert.deepEqual(await rt.canRelease(run),{executionState:'ended'});
 }finally{await f.close();}
});
