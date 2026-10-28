import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { AGENT_EXECUTION_CONTRACTS, connectAgentProcess, withAgentDataOffline, assertAgentUpgradeIdle } from '../../src/index.ts';
import { claim, controlRoot, writePrivate } from '../../src/process/ownership.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import type { AgentProcessIdentity, AgentRuntimeUnit } from '../../src/index.ts';

test('lost transport never replays an operation; original request identity remains queryable', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-result-unknown-'));
  const runtime:AgentRuntimeUnit={schemaVersion:1,digest:'a'.repeat(64),directory:root,entry:path.join(root,'entry.js'),node:process.execPath};
  const identity:AgentProcessIdentity={contracts:AGENT_EXECUTION_CONTRACTS,instanceId:'fixture-owner',generation:'fixture-generation',profileId:'fixture',dataRoot:root,pid:process.pid,runtime};
  let sends=0, misleading=false;
  const server=createServer(async(req,res)=>{
    if(req.url==='/identity'){res.end(JSON.stringify(misleading?{...identity,instanceId:'another-instance'}:identity));return;}
    let input='';for await(const chunk of req)input+=chunk;
    const value=JSON.parse(input);
    if(value.operation==='conversations.send'){sends++;res.destroy();return;}
    res.end(JSON.stringify({found:true,runId:'original-run',accepted:true,requestId:value.args[2]}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');
  writePrivate(path.join(controlRoot(root),'instance.json'),{identity,origin:`http://127.0.0.1:${address.port}`,token:'private-fixture-token'});
  const connection=await connectAgentProcess({dataRoot:root,profileId:'fixture',sourceId:'minimal',runtime});
  try{
    await assert.rejects(connection.operations.conversations.send('scope','conversation',{expectedRevision:'one',connectionId:'one',text:'run',previewToken:'preview',clientRequestId:'original-request'}),{code:'agent_operation_result_unknown'});
    assert.equal((await connection.operations.conversations.lookupRequest('scope','conversation','original-request')).runId,'original-run');assert.equal(sends,1);
    await assert.rejects(connectAgentProcess({dataRoot:root,profileId:'wrong',sourceId:'minimal',runtime}),{code:'agent_process_identity_mismatch'});
    misleading=true;
    await assert.rejects(connectAgentProcess({dataRoot:root,profileId:'fixture',sourceId:'minimal',runtime}),{code:'agent_process_identity_mismatch'});
  }finally{await connection.disconnect();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
});

test('offline maintenance holds the process owner boundary and preserves uncertain release', async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-offline-owner-'));
  try{
    const owner=claim(root,'owner');
    assert.throws(()=>withAgentDataOffline(root,()=>assert.fail('live data must not be overwritten')),{code:'agent_process_owned'});owner.release();
    await withAgentDataOffline(root,async()=>{assert.throws(()=>claim(root,'owner'),{code:'agent_process_owned'});withAgentDataOffline(root,()=>{});});
    writePrivate(path.join(controlRoot(root),'last-stop.json'),{confirmed:false});
    assert.throws(()=>withAgentDataOffline(root,()=>assert.fail()),{code:'agent_process_offline_unconfirmed'});
    fs.rmSync(path.join(controlRoot(root),'last-stop.json'));
    const starting=claim(root,'startup');
    assert.doesNotThrow(()=>assertAgentUpgradeIdle(root,{legacyHostRunning:true}));starting.release();
    assert.throws(()=>assertAgentUpgradeIdle(root,{legacyHostRunning:true}),{code:'agent_legacy_upgrade_requires_exit'});
    const repository=new ConversationRepository(path.join(root,'agent-service'));
    // Only fields needed by legacy activity discovery; no new process is started.
    repository.saveConversation({view:{id:'legacy',workspaceId:'ws',revision:'one',hidden:false,updatedAt:'now',cwd:root,title:'legacy',participants:[],entries:[],requests:[{id:'pending'}]},participants:[],sources:{},requests:{},attachments:{},attempts:[]} as any);
    assert.throws(()=>assertAgentUpgradeIdle(root),{code:'agent_legacy_process_busy'});
    assert.throws(()=>withAgentDataOffline(root,()=>assert.fail()),{code:'agent_legacy_process_busy'});
    const terminal=repository.readConversation('legacy')!;
    terminal.view.requests=[];terminal.view.revision='two';
    terminal.view.run={id:'old-run',generation:'old-generation',status:'stopped',tools:[{id:'tool',status:'unknown',label:'still unconfirmed'}]} as any;
    repository.saveConversation(terminal,'one');
    assert.throws(()=>assertAgentUpgradeIdle(root),{code:'agent_legacy_process_busy'},'a terminal run cannot hide an unconfirmed tool from offline maintenance');
    terminal.view.run!.tools=[];terminal.view.revision='three';repository.saveConversation(terminal,'two');
    assert.doesNotThrow(()=>assertAgentUpgradeIdle(root));
    assert.ok(fs.existsSync(path.join(root,'agent-service/conversations.sqlite')));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('first upgrade client saves and cancels pending instructions without asking the legacy binary to run a new operation',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-legacy-pending-'));
  const runtime:AgentRuntimeUnit={schemaVersion:1,digest:'b'.repeat(64),directory:root,entry:path.join(root,'entry.js'),node:process.execPath};
  const identity:AgentProcessIdentity={contracts:AGENT_EXECUTION_CONTRACTS,instanceId:'legacy',generation:'legacy-generation',profileId:'fixture',dataRoot:root,pid:process.pid,runtime};
  const conversation={id:'conversation',workspaceId:'scope',revision:'first',cwd:root,title:'Legacy',hidden:false,updatedAt:'now',participants:[],entries:[],requests:[]};
  const operations:string[]=[];
  const server=createServer(async(req,res)=>{
    if(req.url==='/identity'){res.end(JSON.stringify(identity));return;}
    let input='';for await(const chunk of req)input+=chunk;const value=JSON.parse(input);operations.push(value.operation);
    assert.equal(value.operation,'conversations.read');res.end(JSON.stringify(conversation));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');
  writePrivate(path.join(controlRoot(root),'instance.json'),{identity,origin:`http://127.0.0.1:${address.port}`,token:'legacy-token'});
  const connection=await connectAgentProcess({dataRoot:root,profileId:'fixture',sourceId:'minimal',runtime});
  try{
    let view=await connection.operations.conversations.queueSend('scope','conversation',{expectedRevision:'first',connectionId:'codex',text:'after upgrade',clientRequestId:'original'});
    assert.equal(view.pendingSend?.state,'waiting');
    view=await connection.operations.conversations.read('scope','conversation');assert.equal(view.pendingSend?.id,'original');
    const cancelled=await connection.operations.conversations.cancelPendingSend('scope','conversation',{expectedPendingRevision:view.pendingSend!.revision});assert.equal(cancelled.pendingSend,undefined);
    assert.ok(operations.every(operation=>operation==='conversations.read'));
  }finally{await connection.disconnect();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
});
