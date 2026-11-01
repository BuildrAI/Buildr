import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareAgentRuntime, stopAgentProcess } from '@buildr-ai/buildr-agent';
import { activateAgentServiceRuntime } from '../../src/modules/agent-service/application/activate-runtime.ts';

// The same activation owner used after launcher installation, with real private
// transport and child processes, no vendor programs or real model accounts.
test('activation reports the exact ready server and rejects an installed target that cannot start', {timeout:60_000}, async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-activation-')),dataRoot=path.join(root,'profile'),packageRoot=path.join(root,'package'),profileId='activation-integration';
  t.after(async()=>{await stopAgentProcess({dataRoot,profileId,mode:'stop-owned'});fs.rmSync(root,{recursive:true,force:true});});
  fs.cpSync(path.resolve(import.meta.dirname,'../../node_modules/@buildr-ai/buildr-agent'),packageRoot,{recursive:true,mode:fs.constants.COPYFILE_FICLONE});
  fs.writeFileSync(path.join(packageRoot,'build/activation-fixture.mjs'),"import fs from 'node:fs';import {startAgentExecutionServer} from './index.js';const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));await startAgentExecutionServer({...input,serviceOptions:{executors:[],modelProviders:[]}});\n");
  const old=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activation-fixture.mjs'});
  const first=await activateAgentServiceRuntime({dataRoot,profileId,runtime:old});
  assert.equal(first.status,'ready');assert.equal(first.targetDigest,old.digest);assert.equal(first.currentDigest,old.digest);assert.equal(first.accepting,true);
  fs.writeFileSync(path.join(packageRoot,'build/activation-marker.json'),'{"version":"new"}\n');
  const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activation-fixture.mjs'});
  const adopted=await activateAgentServiceRuntime({dataRoot,profileId,runtime:next});
  assert.equal(adopted.currentDigest,next.digest);assert.notEqual(adopted.generation,first.generation);assert.notEqual(adopted.pid,first.pid);
  fs.writeFileSync(path.join(packageRoot,'build/activation-broken.mjs'),"throw Error('fixture startup failure');\n");
  const broken=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activation-broken.mjs'});
  await assert.rejects(activateAgentServiceRuntime({dataRoot,profileId,runtime:broken}),{code:'agent_process_activation_failed'});
});
