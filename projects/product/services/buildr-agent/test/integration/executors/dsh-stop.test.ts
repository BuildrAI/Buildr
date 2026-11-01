import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DshRuntime} from '../../../build/executors/dsh/index.js';
import {DshExecutionLineage} from '../../../build/executors/dsh/protocol.js';
import {OwnedControlResource,closeOwnedProcess} from '../../../build/executors/native-process.js';

test('cold stop rejects without fabricating an empty settled observation',async()=>{
 const runtime=new(DshRuntime as any)('binding',{},{});
 const contextRef=runtime.context('context','/isolated');
 await assert.rejects(runtime.stop({contextRef,executionRef:{id:'previous'}}),/未持有原轮执行/);
});

for(const mode of ['owned','shared','protected'] as const)test('unresponsive native stop is bounded and resource scoped: '+mode,{skip:process.platform==='win32'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'dsh-stop-scope-'));
 const control=new OwnedControlResource(process.execPath,['-e',"process.stdout.write('ready');setInterval(()=>{},1000)"],{cwd:root,env:process.env});
 const visible:any[]=[];let runtime:any;
 try{
  await once(control.child.stdout,'data');
  const client={close:async()=>{},remote:{session:{cancel:async()=>({ok:true,value:{}})}}};
  runtime=new(DshRuntime as any)('binding',{control,child:control.child,client,close:()=>closeOwnedProcess(control.child,10)},client);
  const contextRef=runtime.context('context',root),lineage=new DshExecutionLineage('context');
  lineage.record({type:'turn/start',data:{turn:1}});lineage.record({type:'user/message',data:{source:{rpcId:'request'}}});lineage.record({type:'subagent/catalog',data:{childId:'child'}});
  const turn={id:'request',input:{contextRef,cwd:root,clientRequestId:'request',onEvent:(e:any)=>visible.push(e)},lineage,inputIds:new Set(['request']),pending:new Map(),tools:new Map([['done',{id:'done',label:'read',status:'completed'}],['uncertain',{id:'uncertain',label:'write',status:'running'}]])};
  runtime.turns.set('context',turn);
  const addressFile=join(root,'control.json');await writeFile(addressFile,JSON.stringify({port:1}));runtime.forkBridge={key:'private-fixture',addressFile,patch:join(root,'patch.json')};
  if(mode!=='shared')runtime.gateway={identity:'conversation-owned'};
  if(mode==='protected')runtime.turns.set('other',{...turn,id:'other',input:{...turn.input,contextRef:{id:'other'}},inputIds:new Set(['other']),lineage:new DshExecutionLineage('other')});
  const ref=control.executionRef('request','context','binding',true),started=Date.now();
  const [first,second]=await Promise.all([runtime.stop({contextRef,executionRef:ref}),runtime.stop({contextRef,executionRef:ref})]);
  assert.ok(Date.now()-started<5000);assert.deepEqual(first,second);assert.equal(first.tools.find((t:any)=>t.id==='done').status,'completed');
  if(mode==='owned'){
   assert.ok(control.child.exitCode!==null||control.child.signalCode!==null);assert.equal(turn.tools.get('uncertain')?.status,'unknown');assert.equal((turn as any).stopConfirmed,true);
   assert.deepEqual(await runtime.canRelease({contextRef,executionRef:ref}),{executionState:'unknown'});assert.match(first.diagnostic,/已终止本轮独占/);
  }else{
   assert.equal(control.child.exitCode,null);assert.equal(control.child.signalCode,null);assert.equal(first.status,'unknown');assert.match(first.diagnostic,/停止尚未确认/);assert.notEqual((turn as any).stopConfirmed,true);
  }
 }finally{await runtime?.close();await closeOwnedProcess(control.child,10);await rm(root,{recursive:true,force:true});}
});
