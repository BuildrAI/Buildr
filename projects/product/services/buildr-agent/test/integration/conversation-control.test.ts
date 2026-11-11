import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { authorize, body, json, listen, privateToken } from '../../src/process/transport.ts';
import { controlRoot, writePrivate } from '../../src/process/ownership.ts';
import { validateOperation } from '../../src/process/operations.ts';
import { createAgentService } from '../../src/index.ts';
import { conversationControlInstruction } from '../../src/process/conversation-control.ts';

const execute=promisify(execFile);

test('packaged control subprocess reads, observes and precisely stops without exposing credentials or admitting work',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-')),token=privateToken(),calls:Array<{operation:string;args:any[]}>=[];
  const identity={instanceId:randomUUID(),generation:randomUUID(),pid:process.pid,profileId:'control-test',dataRoot:root};
  const binding={dataRoot:root,profileId:identity.profileId,sourceId:'local',scope:'scope',conversationId:'conversation'};
  const run={id:'old',participantId:'participant',generation:identity.generation,status:'tools-active',tools:[{id:'tool',status:'running',canStop:true}]};
  const observed={revision:'observed-revision',run:{id:'new'},retainedRuns:[run],requests:[{id:'question',runId:'old'}],entries:[{text:'private history not returned by the control command'}]};
  const channel=await listen(async(req,res)=>{
    authorize(req,token);
    if(req.url==='/identity'){json(res,200,identity);return;}
    assert.equal(req.url,'/operations');
    const input=await body(req);validateOperation(input.operation,input.args);
    assert.equal(input.sourceId,binding.sourceId);if(input.operation==='conversations.participationSummary')assert.deepEqual(input.args,[binding.scope,{limit:50}]);else assert.deepEqual(input.args.slice(0,2),[binding.scope,binding.conversationId]);
    calls.push(input);
    if(input.operation==='conversations.stop'){
      const control=input.args[2];
      assert.deepEqual(control,{expectedRevision:observed.revision,runId:run.id,participantId:run.participantId,generation:run.generation,toolId:'tool'});
    }
    json(res,200,observed);
  });
  try{
    writePrivate(path.join(controlRoot(root),'instance.json'),{identity,origin:channel.origin,token});
    const entry=path.resolve(import.meta.dirname,'../../../buildr/node_modules/@buildr-ai/buildr-agent/build/process/conversation-control.js');
    const invoke=(...args:string[])=>execute(process.execPath,[entry,JSON.stringify(binding),...args],{timeout:10000});
    const read=JSON.parse((await invoke('read')).stdout);
    assert.deepEqual(read.retainedRuns,[run]);assert.equal(read.entries,undefined);
    assert.equal(JSON.stringify(read).includes(token),false);
    await invoke('observe');
    await invoke('observe',JSON.stringify({expectedRevision:observed.revision,runId:run.id,participantId:run.participantId,generation:run.generation}));
    await invoke('stop',JSON.stringify({expectedRevision:observed.revision,runId:run.id,participantId:run.participantId,generation:run.generation,toolId:'tool'}));
    assert.deepEqual(calls.map(call=>call.operation),['conversations.read','conversations.observe','conversations.observeRun','conversations.stop']);
    await assert.rejects(invoke('send'));
    await assert.rejects(invoke('stop','{}'));
    assert.equal(calls.length,4,'invalid commands never reach the application');
    await invoke('participation',JSON.stringify({runId:'old'}));
    await invoke('participation-summary',JSON.stringify({limit:50}));
    assert.deepEqual(calls.slice(4).map(call=>call.operation),['conversations.read','conversations.participation','conversations.read','conversations.participationSummary']);
    assert.equal(conversationControlInstruction(binding,process.execPath).includes(token),false);
    await invoke('history',JSON.stringify({sourceId:'index-'+'a'.repeat(64)+'.json',roundId:'original',limit:2,view:'messages'}));
    await invoke('entry',JSON.stringify({entryId:'tool',revision:'b'.repeat(64)}));
    assert.deepEqual(calls.slice(8).map(call=>call.operation),['conversations.readHistory','conversations.readEntry']);
    assert.equal(calls[8].args[2].view,'messages');
    assert.deepEqual(calls[9].args,[binding.scope,binding.conversationId,'tool','b'.repeat(64)]);
    await assert.rejects(invoke('entry',JSON.stringify({entryId:'tool',revision:'invalid'})));
    await assert.rejects(invoke('history',JSON.stringify({sourceId:'../../secret'})));
    await assert.rejects(invoke('history',JSON.stringify({sourceId:'index-'+'a'.repeat(64)+'.json',view:'invalid'})));
    identity.instanceId=randomUUID();
    await assert.rejects(invoke('read'),/后台身份已变化/);
    assert.equal(calls.length,10);
  }finally{await channel.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('public Agent package remains synchronously loadable by the bundled CJS host', async () => {
  const entry = path.resolve(import.meta.dirname, '../../../buildr/node_modules/@buildr-ai/buildr-agent/build/index.js');
  const result = await execute(process.execPath, ['-e', 'require(process.argv[1])', entry], { timeout: 10000 });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '');
});


test('agent task adoption appends through the packaged bound control command with real storage and no execution', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-task-link-')),token=privateToken();
  const tasks=new Set(['task-first']);
  const service=createAgentService({dataRoot:path.join(root,'data'),executors:[],resolveWorkspace(scope){assert.equal(scope,'scope');return {rootPath:root};},assertTask(scope,taskId){assert.ok(['scope','remote-scope'].includes(scope));if(!tasks.has(taskId))throw new Error('task unavailable');}});
  const chat=await service.conversations.create('scope',{taskId:'task-first'});
  const identity={instanceId:randomUUID(),generation:randomUUID(),pid:process.pid,profileId:'task-link',dataRoot:root};
  const binding={dataRoot:root,profileId:identity.profileId,sourceId:'local',scope:'scope',conversationId:chat.id};
  const calls:string[]=[];let race=false;
  const channel=await listen(async(req,res)=>{
    authorize(req,token);
    if(req.url==='/identity'){json(res,200,identity);return;}
    assert.equal(req.url,'/operations');const input=await body(req);validateOperation(input.operation,input.args);
    assert.equal(input.sourceId,binding.sourceId);assert.deepEqual(input.args.slice(0,2),[binding.scope,binding.conversationId]);calls.push(input.operation);
    if(input.operation==='conversations.read'){json(res,200,service.conversations.read(binding.scope,chat.id));return;}
    assert.equal(input.operation,'conversations.update','association never submits, stops or observes an execution');
    if(race){race=false;await service.conversations.update(binding.scope,chat.id,{expectedRevision:input.args[2].expectedRevision,title:'concurrent rename'});}
    json(res,200,await service.conversations.update(binding.scope,chat.id,input.args[2]));
  });
  try {
    writePrivate(path.join(controlRoot(root),'instance.json'),{identity,origin:channel.origin,token});
    const entry=path.resolve(import.meta.dirname,'../../../buildr/node_modules/@buildr-ai/buildr-agent/build/process/conversation-control.js');
    const invoke=(action:string,input?:unknown)=>execute(process.execPath,[entry,JSON.stringify(binding),action,...(input===undefined?[]:[JSON.stringify(input)])],{timeout:10000});
    const read=async()=>JSON.parse((await invoke('read')).stdout);
    let current=await read();assert.deepEqual(current.taskIds,['task-first']);assert.equal(current.entries,undefined);
    assert.equal(JSON.stringify(current).includes(token),false);
    assert.deepEqual(service.conversations.read(binding.scope,chat.id).taskIds,['task-first'],'read-only adoption inspection cannot link unrelated tasks');
    tasks.add('task-second');
    current=JSON.parse((await invoke('link-task',{taskId:'task-second'})).stdout);
    assert.deepEqual(current.taskIds,['task-first','task-second']);assert.equal(current.taskId,'task-first');
    const revision=current.revision,updates=calls.filter(value=>value==='conversations.update').length;
    await invoke('link-task',{expectedRevision:revision,taskId:'task-second'});
    assert.equal((await read()).revision,revision);assert.equal(calls.filter(value=>value==='conversations.update').length,updates,'repeated adoption is a no-op');
    tasks.add('task-third');
    await assert.rejects(invoke('link-task',{expectedRevision:chat.revision,taskId:'task-third'}),/已变化/);
    await assert.rejects(invoke('link-task',{expectedRevision:revision,taskId:'missing'}));
    assert.deepEqual((await read()).taskIds,['task-first','task-second']);
    tasks.add('task-third');race=true;
    await assert.rejects(invoke('link-task',{expectedRevision:revision,taskId:'task-third'}),/已变化/);
    current=await read();assert.deepEqual(current.taskIds,['task-first','task-second']);
    assert.equal(service.conversations.read(binding.scope,chat.id).title,'concurrent rename');
    await invoke('link-task',{expectedRevision:current.revision,taskId:'task-third'});
    assert.deepEqual((await read()).taskIds,['task-first','task-second','task-third']);
    current=JSON.parse((await invoke('link-task',{taskId:'task-first',workspaceId:'remote-scope'})).stdout);
    assert.equal(current.taskLinks.length,4);assert.deepEqual(current.taskIds,['task-first','task-second','task-third']);
    assert.deepEqual(current.taskLinks.at(-1),{workspaceId:'remote-scope',taskId:'task-first'});
    const remoteRevision=current.revision;
    await invoke('link-task',{taskId:'task-first',workspaceId:'remote-scope'});assert.equal((await read()).revision,remoteRevision);
    const before=calls.length;
    for(const input of [{workspaceId:'',taskId:'task-first'},{},{expectedRevision:current.revision,taskIds:[]},{expectedRevision:current.revision,taskId:'task-second',title:'not allowed'}])await assert.rejects(invoke('link-task',input));
    assert.equal(calls.length,before,'invalid association input never reaches the application');
    const final=service.conversations.read(binding.scope,chat.id);assert.equal(final.run,undefined);assert.deepEqual(final.entries,[]);assert.equal(final.hidden,false);
  } finally {await channel.close();await service.close();fs.rmSync(root,{recursive:true,force:true});}
});
