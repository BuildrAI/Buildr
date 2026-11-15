import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentProcessConnection, ConversationView } from '../../../../src/index.ts';
import { actor, until, prepareAgentRuntime, connectAgentProcess, copyPackage, prepared, cleanupProcessFixture } from '../../../support/process-fixture.ts';

for(const releasedBeforeAttach of [false,true])test('a replacement owning host keeps interrupted work observable and continues only when the user says so; alreadyReleased='+releasedBeforeAttach, {timeout:90000}, async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-process-goal-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
  fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);
  fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  fs.writeFileSync(path.join(packageRoot,'build/fixture-version.json'),JSON.stringify({version:'goal'}));
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='released';
  let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  t.after(()=>cleanupProcessFixture({root,dataRoot,profileId,host:main,observer}));
  main=await actor({dataRoot,profileId,runtime,workspace,legacySourceId:'minimal',autoContinueInterrupted:false});
  observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
  const identity=await observer.lifecycle.identity(),scope=main.info.scope;
  const connection=await main.call('connections.read',['first']);await main.call('connections.connect',['first',{expectedRevision:connection.revision}]);
  const account=await main.call('models.accounts.add',[{provider:'fixture-model'}]),checked=await main.call('models.accounts.check',[account.id]);
  await main.call('models.accounts.preferences',[account.id,{expectedRevision:checked.revision,models:[{id:'fixture',enabled:true}]}]);
  const chat:ConversationView=await main.call('conversations.create',[scope,{}]);
  const draft={connectionId:'first',modelAccountId:account.id,model:'fixture',text:'goal-recovery',expectedRevision:chat.revision};
  const preview=await main.call('conversations.prepareSend',[scope,chat.id,draft]);
  await main.call('conversations.send',[scope,chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()}]);
  const interrupted=await until(()=>observer!.operations.conversations.read(scope,chat.id),view=>view.run?.status==='unknown');
  assert.equal(fs.readFileSync(path.join(dataRoot,'first-result'),'utf8'),'already applied');
  assert.equal(fs.existsSync(path.join(dataRoot,'remaining-result')),false);
  if(releasedBeforeAttach){
    fs.writeFileSync(path.join(dataRoot,'release-uncertain-resource'),'yes');
    await until(()=>observer!.operations.conversations.read(scope,chat.id),view=>view.run?.resourcesReleased===true);
    assert.equal(fs.existsSync(path.join(dataRoot,'remaining-result')),false,'the explicit disabled policy still applies');
  }
  const recoveryScans = () => fs.readFileSync(path.join(dataRoot, 'recovery-scans'), 'utf8').trim().split('\n').length;
  assert.equal(recoveryScans(), 1, 'the first host starts recovery only once');
  for (let read = 0; read < 3; read++) {
    await main.call('conversations.read', [scope, chat.id]);
    await main.call('conversations.list', [scope, { fields: 'summary' }]);
  }
  assert.equal(recoveryScans(), 1, 'refreshing the same host registration does not scan history');

  await main.close();
  main=await actor({dataRoot,profileId,runtime,workspace,legacySourceId:'minimal',autoContinueInterrupted:true});
  assert.equal(main.info.identity.generation,identity.generation,'policy refresh must not interrupt the existing backend');
  await until(async () => recoveryScans(), count => count === 2);
  fs.writeFileSync(path.join(dataRoot,'release-uncertain-resource'),'yes');
  // Automatic recovery may not open a replacement native session, so the
  // interrupted goal stays unknown and observable instead of being replayed.
  const settled=await until(()=>observer!.operations.conversations.read(scope,chat.id),view=>Boolean(view.run?.diagnostic)||view.run?.status!=='unknown');
  assert.equal(settled.run?.status,'unknown');
  assert.equal(fs.existsSync(path.join(dataRoot,'remaining-result')),false);
  const automatic=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(automatic.length,1);assert.equal(automatic[0].text,'goal-recovery');
  // A later user message is a separate explicit request; this scan must not
  // have created a replacement session or replayed the interrupted command.
  assert.equal(settled.run?.id,interrupted.run!.id);
  assert.equal(settled.entries.some(entry=>entry.kind==='handoff'&&entry.nativeSession),false);
});
