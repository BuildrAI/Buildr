import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareAgentRuntimeAsync } from '../../src/process/runtime-preparation.ts';
import { validateAgentRuntime } from '../../src/process/runtime-unit.ts';
import { AGENT_EXECUTION_CONTRACTS } from '../../src/execution-contracts.ts';
import { controlRoot, readLock, readProcessRecord, writePrivate } from '../../src/process/ownership.ts';
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

test('a hard-linked package descriptor prepares, while private and materialized records stay exclusive',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-preparation-links-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const packageRoot=path.join(root,'package'),dataRoot=path.join(root,'data'),shared=path.join(root,'shared-contracts.json');
  fs.mkdirSync(path.join(packageRoot,'build'),{recursive:true});
  fs.writeFileSync(path.join(packageRoot,'package.json'),'{}');
  fs.writeFileSync(path.join(packageRoot,'build/entry.js'),'// shared package fixture\n');
  fs.writeFileSync(shared,JSON.stringify({contracts:AGENT_EXECUTION_CONTRACTS,storageVersion:0}));
  // Copy workflows (worktree builds, package managers) share package bytes through hard links.
  fs.linkSync(shared,path.join(packageRoot,'build/runtime-contracts.json'));
  assert.equal(fs.lstatSync(path.join(packageRoot,'build/runtime-contracts.json')).nlink,2);
  const runtime=await prepareAgentRuntimeAsync({dataRoot,packageRoot,entry:'build/entry.js'});
  validateAgentRuntime(dataRoot,runtime);
  const materialized=path.join(runtime.directory,'build/runtime-contracts.json');
  assert.equal(fs.lstatSync(materialized).nlink,1,'materialized descriptor stays exclusive');
  fs.linkSync(materialized,path.join(root,'runtime-contracts-link.json'));
  assert.throws(()=>validateAgentRuntime(dataRoot,runtime),error=>error instanceof AgentServiceError&&error.code==='agent_process_storage_unsafe'&&/runtime-contracts\.json/.test(error.message));
  const record=path.join(controlRoot(dataRoot),'probe.json');writePrivate(record,{ok:true});fs.linkSync(record,path.join(root,'probe-link.json'));
  assert.throws(()=>writePrivate(record,{ok:false}),error=>error instanceof AgentServiceError&&error.code==='agent_process_storage_unsafe'&&/probe\.json/.test(error.message));
});
