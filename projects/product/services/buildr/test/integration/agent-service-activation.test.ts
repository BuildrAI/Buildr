import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectAgentProcess, prepareAgentRuntime, stopAgentProcess } from '@buildr-ai/buildr-agent';
import { activateAgentServiceRuntime } from '../../src/modules/agent-service/application/activate-runtime.ts';

// The same activation owner used after launcher installation, with real private
// transport and child processes, no vendor programs or real model accounts.
test('activation reports the exact ready server and rejects an installed target that cannot start', {timeout:60_000}, async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-activation-')),dataRoot=path.join(root,'profile'),packageRoot=path.join(root,'package'),profileId='activation-integration';
  t.after(async()=>{await stopAgentProcess({dataRoot,profileId,mode:'stop-owned'});fs.rmSync(root,{recursive:true,force:true});});
  fs.cpSync(path.resolve(import.meta.dirname,'../../node_modules/@buildr-ai/buildr-agent'),packageRoot,{recursive:true,mode:fs.constants.COPYFILE_FICLONE});
  fs.writeFileSync(path.join(packageRoot,'build/activation-fixture.mjs'),`import fs from 'node:fs';import {startAgentExecutionServer} from './index.js';
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const provider={id:'fixture',label:'fixture',open:async()=>({protocol:'chat-completions',inspect:async()=>({status:'ready',models:[{id:'m',label:'m',images:false,tools:false}]}),beginLogin:async()=>{},cancelLogin:async()=>{},close:async()=>{},infer:async({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))})};
await startAgentExecutionServer({...input,serviceOptions:{executors:[],modelProviders:[provider]}});\n`);
  const old=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activation-fixture.mjs'});
  const legacy=await connectAgentProcess({dataRoot,profileId,runtime:old,sourceId:'local'});
  const legacyStatus=await legacy.lifecycle.status();
  const added=await legacy.operations.models.accounts.add({provider:'fixture'});
  const checked=await legacy.operations.models.accounts.check(added.id);
  const account=await legacy.operations.models.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:'m',enabled:true}]});
  const abort=new AbortController();
  const generating=legacy.operations.models.generate({accountId:account.id,modelId:'m',agentId:'codex',conversationId:'activation-busy',runId:'busy',prompt:'fixture',signal:abort.signal});generating.catch(()=>{});
  try{
    for(let attempt=0;attempt<100&&!(await legacy.lifecycle.status()).activity.busy;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal((await legacy.lifecycle.status()).activity.busy,true);
    await assert.rejects(activateAgentServiceRuntime({dataRoot,profileId,runtime:old}),{code:'agent_process_busy'});
    assert.equal((await legacy.lifecycle.identity()).generation,legacyStatus.identity.generation,'busy old backend must not be stopped to repair source identity');
  }finally{abort.abort();await generating.catch(()=>{});}
  for(let attempt=0;attempt<100&&(await legacy.lifecycle.status()).activity.busy;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
  await legacy.disconnect();
  const first=await activateAgentServiceRuntime({dataRoot,profileId,runtime:old});
  assert.notEqual(first.generation,legacyStatus.identity.generation,'an idle backend with inherited missing source identity must be rebuilt');
  assert.equal(first.status,'ready');assert.equal(first.targetDigest,old.digest);assert.equal(first.currentDigest,old.digest);assert.equal(first.accepting,true);
  const connection=await connectAgentProcess({dataRoot,profileId,runtime:old,sourceId:'buildr',legacySourceId:'buildr',host:{
    resolveExecutionScope:async({ref})=>({ref,revision:'fixture',rootPath:root}),
    verifyWorkObject:async()=>{throw Error('unused');},
    listExecutionScopes:async()=>({refs:[{sourceId:'buildr',id:'workspace'}],revision:'fixture'}),
  }});
  try{
    const conversation=await connection.operations.conversations.create('workspace',{cwd:root,title:'activation conversation check'});
    assert.equal(conversation.workspaceId,'workspace','the activated backend must accept the same scope identity as the Web host');
  }finally{await connection.disconnect();}
  fs.writeFileSync(path.join(packageRoot,'build/activation-marker.json'),'{"version":"new"}\n');
  const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activation-fixture.mjs'});
  const adopted=await activateAgentServiceRuntime({dataRoot,profileId,runtime:next});
  assert.equal(adopted.currentDigest,next.digest);assert.notEqual(adopted.generation,first.generation);assert.notEqual(adopted.pid,first.pid);
  fs.writeFileSync(path.join(packageRoot,'build/activation-broken.mjs'),"throw Error('fixture startup failure');\n");
  const broken=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activation-broken.mjs'});
  await assert.rejects(activateAgentServiceRuntime({dataRoot,profileId,runtime:broken}),(error:any)=>{assert.equal(error.code,'agent_process_activation_failed');assert.equal(error.stage,'connect');assert.match(error.message,/connect.*agent_process_activation_failed/);return true;});
});
