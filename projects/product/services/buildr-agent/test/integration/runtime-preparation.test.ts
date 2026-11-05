import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareAgentRuntimeAsync } from '../../src/process/runtime-preparation.ts';
import { validateAgentRuntime } from '../../src/process/runtime-unit.ts';
import { AGENT_EXECUTION_CONTRACTS } from '../../src/execution-contracts.ts';
import { controlRoot, readLock, readProcessRecord } from '../../src/process/ownership.ts';
import { connectAgentProcess } from '../../src/process/client.ts';
import { assertAgentUpgradeIdle } from '../../src/process/offline-data.ts';
import { AgentServiceError } from '../../src/domain/agent-state.ts';

test('cold runtime preparation yields to the host and retains byte validation',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-preparation-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const packageRoot=path.join(root,'package'),dataRoot=path.join(root,'data');
  fs.mkdirSync(path.join(packageRoot,'build'),{recursive:true});
  fs.writeFileSync(path.join(packageRoot,'package.json'),'{}');
  fs.writeFileSync(path.join(packageRoot,'build/runtime-contracts.json'),JSON.stringify({contracts:AGENT_EXECUTION_CONTRACTS,storageVersion:0}));
  fs.writeFileSync(path.join(packageRoot,'build/entry.js'),'// prepared runtime fixture\n');
  let yieldedBeforeMaterialization=false;
  const turn=new Promise<void>(resolve=>setImmediate(()=>{yieldedBeforeMaterialization=!fs.existsSync(path.join(controlRoot(dataRoot),'runtimes'));resolve();}));
  const prepared=prepareAgentRuntimeAsync({dataRoot,packageRoot,entry:'build/entry.js'});
  await turn;
  assert.equal(yieldedBeforeMaterialization,true,'host can handle another event before cold preparation finishes');
  const runtime=await prepared;validateAgentRuntime(dataRoot,runtime);
  fs.chmodSync(runtime.entry,0o600);
  fs.writeFileSync(runtime.entry,'// corrupted\n');
  assert.throws(()=>validateAgentRuntime(dataRoot,runtime));
});

test('preparation preserves typed failure without retrying missing input',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-preparation-error-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  await assert.rejects(prepareAgentRuntimeAsync({dataRoot:path.join(root,'data'),packageRoot:root}),error=>error instanceof AgentServiceError&&error.code==='agent_runtime_entry_missing');
});

test('a cancelled host waits for preparation cleanup without launching a backend',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-preparation-cancel-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const controller=new AbortController(),reason=new Error('owning host closed');
  const connecting=connectAgentProcess({dataRoot:root,profileId:'fixture',sourceId:'minimal',signal:controller.signal});
  assert.equal(readLock(root,'startup')?.pid,process.pid,'cold preparation already belongs to isolated startup');
  assert.doesNotThrow(()=>assertAgentUpgradeIdle(root,{legacyHostRunning:true}),'a cold isolated startup is not a legacy host');
  await new Promise<void>(resolve=>setImmediate(resolve));
  controller.abort(reason);
  await assert.rejects(connecting,error=>error===reason);
  assert.equal(readLock(root,'startup'),undefined);
  assert.equal(readLock(root,'storage'),undefined);
  assert.equal(readProcessRecord(root),undefined,'closing during preparation never launches a late backend');
  const runtimes=path.join(controlRoot(root),'runtimes');
  assert.deepEqual(fs.existsSync(runtimes)?fs.readdirSync(runtimes).filter(name=>name.startsWith('.stage-')):[],[]);
});
