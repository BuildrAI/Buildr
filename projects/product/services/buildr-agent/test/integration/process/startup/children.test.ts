import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { executionScopeKey } from '../../../../src/index.ts';
import { actor, prepareAgentRuntime, copyPackage, prepared, cleanupProcessFixture } from '../../../support/process-fixture.ts';

test('child conversation creation and relation reads cross the independent process boundary without an executor',{timeout:30000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-child-process-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work');fs.mkdirSync(workspace);
  const packageRoot=path.join(root,'package');copyPackage(prepared,packageRoot);
  fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  fs.writeFileSync(path.join(packageRoot,'build/fixture-version.json'),JSON.stringify({version:'child-test'}));
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='child-isolation',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  let host:Awaited<ReturnType<typeof actor>>|undefined;
  t.after(() => cleanupProcessFixture({root,dataRoot,profileId,host:host,observer:undefined}));
  {
    host=await actor({dataRoot,profileId,runtime,workspace});
    const parent=await host.call('conversations.create',[scope,{}]),input={expectedRevision:parent.revision,clientRequestId:randomUUID()};
    const child=await host.call('conversations.createChild',[scope,parent.id,input]);
    assert.equal(child.childOf.conversationId,parent.id);assert.deepEqual(child.participants,[]);assert.equal(child.run,undefined);
    assert.equal((await host.call('conversations.listChildren',[scope,parent.id,{}])).conversations[0].id,child.id);
    assert.equal((await host.call('conversations.createChild',[scope,parent.id,input])).id,child.id);
    assert.equal((await host.call('conversations.read',[scope,parent.id])).revision,parent.revision);
  }});
