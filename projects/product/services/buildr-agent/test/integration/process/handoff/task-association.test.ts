import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { executionScopeKey } from '../../../../src/index.ts';
import type { AgentProcessConnection, ConversationView } from '../../../../src/index.ts';
import { actor, until, prepareAgentRuntime, connectAgentProcess, copyPackage, prepared, cleanupProcessFixture } from '../../../support/process-fixture.ts';

const execute=promisify(execFile);

test('current metadata owner links a task while an older schema retains the active native execution',{timeout:90_000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-task-routing-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
  fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);
  fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  const schemaFile=path.join(packageRoot,'build/operation-schemas.js'),schema=fs.readFileSync(schemaFile,'utf8');
  const legacy=schema.replace('taskIds: list(text), taskId: {','taskId: {');
  assert.notEqual(legacy,schema,'the retained process must really reject the new taskIds input');fs.writeFileSync(schemaFile,legacy);
  const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'legacy-task-schema'}));
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='task-routing',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  let host:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  t.after(()=>cleanupProcessFixture({root,dataRoot,profileId,host,observer}));
  host=await actor({dataRoot,profileId,runtime,workspace});observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
  const old=await observer.lifecycle.identity(),connection=await host.call('connections.read',['first']);
  await host.call('connections.connect',['first',{expectedRevision:connection.revision}]);
  const added=await host.call('models.accounts.add',[{provider:'fixture-model'}]),account=await host.call('models.accounts.check',[added.id]);
  await host.call('models.accounts.preferences',[account.id,{expectedRevision:account.revision,models:[{id:'fixture',enabled:true}]}]);
  let chat:ConversationView=await host.call('conversations.create',[scope,{taskId:'task-first'}]);
  const draft={expectedRevision:chat.revision,connectionId:'first',modelAccountId:account.id,model:'fixture',text:'hold'};
  const preview=await host.call('conversations.prepareSend',[scope,chat.id,draft]);
  await host.call('conversations.send',[scope,chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()}]);
  chat=await until(()=>observer!.operations.conversations.read(scope,chat.id),value=>value.run?.accepted===true);
  const runId=chat.run!.id;
  fs.writeFileSync(schemaFile,schema);fs.writeFileSync(marker,JSON.stringify({version:'current-task-schema'}));
  const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});
  const activated=await connectAgentProcess({dataRoot,profileId,runtime:next,sourceId:'minimal',requireRuntime:true,activationTimeoutMs:10_000});
  try {
    assert.notEqual((await activated.lifecycle.identity()).generation,old.generation);
    await host.close();host=await actor({dataRoot,profileId,runtime:next,workspace});
    const binding={dataRoot,profileId,sourceId:'minimal',scope,conversationId:chat.id};
    const result=await execute(next.node,[path.join(next.directory,'build/process/conversation-control.js'),JSON.stringify(binding),'link-task',JSON.stringify({taskId:'task-second'})],{timeout:15_000});
    assert.deepEqual(JSON.parse(result.stdout).taskIds,['task-first','task-second']);
    chat=await activated.operations.conversations.read(scope,chat.id);
    assert.equal(chat.run!.id,runId);assert.equal(chat.run!.generation,old.generation);assert.equal(chat.run!.status,'running');
    fs.writeFileSync(path.join(dataRoot,'release'),'yes');
    const done=await until(()=>activated.operations.conversations.read(scope,chat.id),value=>value.run?.status==='completed');
    assert.deepEqual(done.taskIds,['task-first','task-second'],'old execution completion preserves current metadata');
    const sends=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n');assert.equal(sends.length,1,'metadata linking never restarts or resends work');
  } finally {await activated.disconnect();}
});
