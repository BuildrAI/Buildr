import assert from 'node:assert/strict';
import { acquirePreparedProcessFixture } from '../../../support/prepared-process-fixture.ts';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { executionScopeKey } from '../../../../src/index.ts';
import { actor, cleanupProcessFixture } from '../../../support/process-fixture.ts';

test('child conversation creation and relation reads cross the independent process boundary without an executor',{timeout:30000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-child-process-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work');fs.mkdirSync(workspace);

  const runtime=acquirePreparedProcessFixture(dataRoot),profileId='child-isolation',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  let host:Awaited<ReturnType<typeof actor>>|undefined;
  t.after(() => cleanupProcessFixture({root,dataRoot,profileId,host:host,observer:undefined}));
  {
    host=await actor({dataRoot,profileId,runtime,workspace});
    assert.deepEqual(await host.call('conversations.pendingSummary',[]),{conversations:[]},'global summaries cross the real process without a per-workspace argument');
    await assert.rejects(host.call('conversations.list',[executionScopeKey({sourceId:'other',id:'directory'}),{}]),{code:'agent_host_source_mismatch'});
    const parent=await host.call('conversations.create',[scope,{}]),input={expectedRevision:parent.revision,clientRequestId:randomUUID()};
    const child=await host.call('conversations.createChild',[scope,parent.id,input]);
    assert.equal(child.childOf.conversationId,parent.id);assert.deepEqual(child.participants,[]);assert.equal(child.run,undefined);
    assert.equal((await host.call('conversations.listChildren',[scope,parent.id,{}])).conversations[0].id,child.id);
    assert.equal((await host.call('conversations.createChild',[scope,parent.id,input])).id,child.id);
    assert.equal((await host.call('conversations.read',[scope,parent.id])).revision,parent.revision);
  }});
