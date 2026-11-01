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
    assert.equal(input.sourceId,binding.sourceId);assert.deepEqual(input.args.slice(0,2),[binding.scope,binding.conversationId]);
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
    assert.equal(conversationControlInstruction(binding,process.execPath).includes(token),false);
    identity.instanceId=randomUUID();
    await assert.rejects(invoke('read'),/后台身份已变化/);
    assert.equal(calls.length,4);
  }finally{await channel.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('public Agent package remains synchronously loadable by the bundled CJS host', async () => {
  const entry = path.resolve(import.meta.dirname, '../../../buildr/node_modules/@buildr-ai/buildr-agent/build/index.js');
  const result = await execute(process.execPath, ['-e', 'require(process.argv[1])', entry], { timeout: 10000 });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '');
});
