import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertPluginSourcePhaseProof, collectPluginSourceVerificationBundle, parseVerificationInputs, PLUGIN_PEER_PHASE_FILES, PLUGIN_SOURCE_PHASE_IDS, pluginSourcePhaseFiles, pluginSourcePhaseStep, pluginSourceSdkKey } from '../../tools/verify-all.ts';

test('manual activation tests report the missing explicit SDK while formal full verification still rejects it', t => {
  const root = mkdtempSync(join(tmpdir(), 'buildr-plugin-no-sdk-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { ...process.env, BUILDR_DSH_SDK_ROOT: join(root, 'unselected-sdk') };
  delete env.BUILDR_DSH_SOURCE_SDK_ROOT;
  delete env.NODE_TEST_CONTEXT;
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', fileURLToPath(new URL('../integration/activation.test.ts', import.meta.url))], {
    cwd: root, env, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal([...output.matchAll(/# SKIP explicit verified source SDK required/gu)].length, 4, output);
  for (const name of [
    'same-domain qualification is exclusive in order @buildr-ai/buildr-dsh-plugin then @buildr-ai/buildr-dsh-plugin-dev',
    'same-domain qualification is exclusive in order @buildr-ai/buildr-dsh-plugin-dev then @buildr-ai/buildr-dsh-plugin',
    'normal owner disposal releases the lease for a surviving plugin recheck',
    'independent service domains each retain their own owner',
  ]) assert.ok(output.includes(name), name);
  assert.match(output, /# pass 0\b/u);
  assert.match(output, /# fail 0\b/u);
  assert.match(output, /# skipped 4\b/u);
  assert.deepEqual(readdirSync(root), [], 'missing SDK must not create a guessed SDK or shared runtime output');
  assert.throws(() => parseVerificationInputs([], {}), /完整验证需要/u);
});

test('source and fresh peer phases partition every integration file without dropping coverage', () => {
  const all = readdirSync(new URL('../integration/', import.meta.url)).filter(file => file.endsWith('.test.ts')).map(file => `test/integration/${file}`).sort();
  const cached = pluginSourcePhaseFiles('integration');
  assert.deepEqual([...cached, ...PLUGIN_PEER_PHASE_FILES].sort(), all);
  assert.equal(new Set([...cached, ...PLUGIN_PEER_PHASE_FILES]).size, all.length);
  assert.deepEqual(PLUGIN_SOURCE_PHASE_IDS, ['dsh-plugin:unit', 'dsh-plugin:integration']);
});
test('source phase execution binds the real managed worker budget into its reusable recipe', async () => {
  const { createVerificationReuseIdentity } = await import(new URL('../../../buildr/test/verification/verification-reuse.ts', import.meta.url).href);
  const files = ['test/unit/first.test.ts', 'test/unit/second.test.ts'];
  const one = pluginSourcePhaseStep('unit', files, { BUILDR_VERIFICATION_WORKER_BUDGET: '1' });
  const two = pluginSourcePhaseStep('unit', files, {});
  assert.deepEqual(one.executor.args, ['--test-concurrency=1']);
  assert.deepEqual(one.resourceDemand, { workers: 1, processes: 1 });
  assert.deepEqual(two.executor.args, ['--test-concurrency=2']);
  assert.throws(() => pluginSourcePhaseStep('unit', files, { BUILDR_VERIFICATION_WORKER_BUDGET: '0' }));
  const sha = `sha256-${'a'.repeat(64)}`;
  const snapshot: any = { contentIdentities: { plugin: sha }, environment: { platform: 'darwin', arch: 'arm64', nodeVersion: '24.21.0', variablesIdentity: sha,
    tools: { 'backend-dependencies': sha, 'web-dependencies': sha, 'plugin-dependencies': sha } } };
  assert.notEqual(createVerificationReuseIdentity(one, snapshot)!.key, createVerificationReuseIdentity(two, snapshot)!.key);
});
test('a new peer retains source integration proof while SDK, source or platform changes invalidate it', async () => {
  const { createVerificationReuseIdentity } = await import(new URL('../../../buildr/test/verification/verification-reuse.ts', import.meta.url).href);
  const sha = (value: string) => `sha256-${value.repeat(64)}`;
  const snapshot = { contentIdentities: { plugin: sha('a') }, environment: { platform: 'darwin', arch: 'arm64', nodeVersion: '24.21.0',
    variablesIdentity: sha('b'), tools: { sdk: sha('c'), peer: sha('d'), 'backend-dependencies':sha('1'),'web-dependencies':sha('2'),'plugin-dependencies':sha('3') } } };
  const step = pluginSourcePhaseStep('integration', pluginSourcePhaseFiles('integration'));
  const key = createVerificationReuseIdentity(step,snapshot).key;
  const peerChanged = structuredClone(snapshot); peerChanged.environment.tools.peer=sha('e');
  assert.equal(createVerificationReuseIdentity(step,peerChanged).key,key);
  const sdkChanged = structuredClone(snapshot);sdkChanged.environment.tools.sdk=sha('e');
  assert.notEqual(createVerificationReuseIdentity(step,sdkChanged).key,key);
  const sourceChanged=structuredClone(snapshot);sourceChanged.contentIdentities.plugin=sha('f');
  assert.notEqual(createVerificationReuseIdentity(step,sourceChanged).key,key);
  const platformChanged=structuredClone(snapshot);platformChanged.environment.platform='linux';
  assert.notEqual(createVerificationReuseIdentity(step,platformChanged).key,key);
});
test('collector exports real completed source phases from the selected worktree with the pinned SDK identity', async t => {
  const repo=realpathSync(mkdtempSync(join(tmpdir(),'buildr-plugin-phase-')));t.after(()=>rmSync(repo,{recursive:true,force:true}));
  const backend=join(repo,'projects/product/services/buildr'),pluginRoot=join(repo,'projects/product/services/dsh-plugin');
  mkdirSync(backend,{recursive:true});mkdirSync(join(pluginRoot,'sdk-patches'),{recursive:true});
  for(const name of ['dsh-v0.2.0-rc.2-event-sources-settings.json','dsh-v0.2.0-rc.2-event-sources-settings.patch']) copyFileSync(new URL('../../sdk-patches/'+name,import.meta.url),join(pluginRoot,'sdk-patches',name));
  for(const group of ['unit','integration']){mkdirSync(join(pluginRoot,'test',group),{recursive:true});writeFileSync(join(pluginRoot,'test',group,'fixture.test.ts'),"import test from 'node:test';test('fixture',()=>{});\n");}
  const git=(...args:string[])=>execFileSync('git',args,{cwd:repo,stdio:['ignore','pipe','pipe']});
  git('init','-q');git('config','user.name','Plugin test');git('config','user.email','plugin@example.com');git('add','.');git('commit','-qm','source');
  const env={...process.env,BUILDR_VERIFICATION_WORKER_BUDGET:'1',BUILDR_VERIFICATION_REUSE_DIR:join(repo,'cache')};
  delete env.NODE_TEST_CONTEXT;
  const {collectVerificationReuseSnapshot,createVerificationReuseStore,createVerificationReuseIdentity}=await import(new URL('../../../buildr/test/verification/verification-reuse.ts',import.meta.url).href);
  const {runVerificationStep}=await import(new URL('../../../buildr/test/verification/timing/parallel-runner.ts',import.meta.url).href);
  // Keep the cache outside the source identity, as the normal temporary cache is.
  const cache=realpathSync(mkdtempSync(join(tmpdir(),'buildr-plugin-phase-cache-')));env.BUILDR_VERIFICATION_REUSE_DIR=cache;t.after(()=>rmSync(cache,{recursive:true,force:true}));
  for(const group of ['unit','integration'] as const){
    const step=pluginSourcePhaseStep(group,pluginSourcePhaseFiles(group,pluginRoot),env);
    const snapshot=collectVerificationReuseSnapshot({productRoot:backend,env});snapshot.environment.tools.sdk=pluginSourceSdkKey(pluginRoot);
    const store=createVerificationReuseStore({productRoot:backend,env,snapshot,steps:[step]});
    const startedAt=new Date().toISOString();const result=await runVerificationStep({name:step.id,command:process.execPath,args:['--test',...step.executor.args,...step.executor.files],cwd:pluginRoot,env});
    assert.equal(result.status,'passed');assert.match(result.stdout,/\btests 1\b/u);assert.match(result.stdout,/\bpass 1\b/u);store.stage(step,result,{kind:'local',runId:'plugin-fixture',sourceCommit:snapshot.sourceCommit,startedAt,finishedAt:new Date().toISOString()});
    const after=collectVerificationReuseSnapshot({productRoot:backend,env});after.environment.tools.sdk=pluginSourceSdkKey(pluginRoot);store.commit(after,true);
  }
  const bundle=await collectPluginSourceVerificationBundle({repo,env});assert.deepEqual(bundle.records.map((value:any)=>value.identity.stepId).sort(),[...PLUGIN_SOURCE_PHASE_IDS].sort());
  rmSync(cache,{recursive:true,force:true});mkdirSync(cache);
  assert.equal((await collectPluginSourceVerificationBundle({repo,env,imports:bundle})).records.length,2);
  assert.equal((await collectPluginSourceVerificationBundle({repo,env,imports:{...bundle,records:[null,...bundle.records]}})).records.length,2);
  const wrongSdk=structuredClone(bundle),record=wrongSdk.records.find((value:any)=>value.identity.stepId==='dsh-plugin:integration');
  record.environment.tools.sdk='e'.repeat(64);
  const wrongSnapshot=collectVerificationReuseSnapshot({productRoot:backend,env});wrongSnapshot.environment=record.environment;
  record.identity=createVerificationReuseIdentity(pluginSourcePhaseStep('integration',pluginSourcePhaseFiles('integration',pluginRoot),env),wrongSnapshot);record.identityAfter=record.identity.key;
  assert.deepEqual((await collectPluginSourceVerificationBundle({repo,env,imports:wrongSdk})).records.map((value:any)=>value.identity.stepId),['dsh-plugin:unit']);
  const otherPlatform=structuredClone(bundle),foreignRecord=otherPlatform.records.find((value:any)=>value.identity.stepId==='dsh-plugin:integration');
  foreignRecord.environment.platform=process.platform==='darwin'?'linux':'darwin';
  const foreignSnapshot=collectVerificationReuseSnapshot({productRoot:backend,env});foreignSnapshot.environment=foreignRecord.environment;
  foreignRecord.identity=createVerificationReuseIdentity(pluginSourcePhaseStep('integration',pluginSourcePhaseFiles('integration',pluginRoot),env),foreignSnapshot);foreignRecord.identityAfter=foreignRecord.identity.key;
  assert.deepEqual((await collectPluginSourceVerificationBundle({repo,env,imports:otherPlatform})).records.map((value:any)=>value.identity.stepId),['dsh-plugin:unit']);
  const step=pluginSourcePhaseStep('integration',pluginSourcePhaseFiles('integration',pluginRoot),env);
  const snapshot=collectVerificationReuseSnapshot({productRoot:backend,env});snapshot.environment.tools.sdk=pluginSourceSdkKey(pluginRoot);
  const options={productRoot:backend,env,snapshot,steps:[step],imports:[bundle],portableImports:true};
  const reading=createVerificationReuseStore(options),reused=reading.lookup(step);assert.ok(reused);
  const phase={...reused.result,disposition:'reused'};
  await assertPluginSourcePhaseProof({productRoot:backend,step,store:reading,record:reused,snapshot,current:snapshot,phase});
  const failedResult={...reused.result,status:'failed',exitCode:1,childOutcome:'failed',childExitCode:1,processCleanup:{status:'clean'}};
  const failing=createVerificationReuseStore(options);failing.stage(step,failedResult,reused.origin);
  await assert.rejects(assertPluginSourcePhaseProof({productRoot:backend,step,store:reading,record:reused,snapshot,current:snapshot,phase}),{code:'verification-proof-invalidated'});
  assert.equal(phase.childOutcome,'passed');assert.equal(phase.childExitCode,0);
  assert.deepEqual((await collectPluginSourceVerificationBundle({repo,env,imports:bundle})).records.map((value:any)=>value.identity.stepId),['dsh-plugin:unit']);
  const executing=createVerificationReuseStore(options),freshPhase={...reused.result,disposition:'executed'};
  executing.stage(step,{...reused.result,processCleanup:{status:'clean'}},reused.origin);
  const newerFailure=createVerificationReuseStore(options);newerFailure.stage(step,failedResult,reused.origin);
  const rejected=executing.commit(snapshot,true);assert.equal(rejected.records.length,0);
  await assert.rejects(assertPluginSourcePhaseProof({productRoot:backend,step,store:executing,record:rejected.records[0],snapshot,current:snapshot,phase:freshPhase}),{code:'verification-proof-invalidated'});
  assert.equal(freshPhase.childOutcome,'passed');assert.equal(freshPhase.childExitCode,0);
  const fresh=createVerificationReuseStore(options);fresh.stage(step,{...reused.result,processCleanup:{status:'clean'}},reused.origin);
  const accepted=fresh.commit(snapshot,true);assert.equal(accepted.records.length,1);
  await assertPluginSourcePhaseProof({productRoot:backend,step,store:fresh,record:accepted.records[0],snapshot,current:snapshot,phase:freshPhase});
  const blockedCache=join(cache,'cache-is-a-file');writeFileSync(blockedCache,'not a directory');
  const unavailable=createVerificationReuseStore({...options,env:{...env,BUILDR_VERIFICATION_REUSE_DIR:blockedCache}});
  assert.equal(unavailable.cacheAvailable(),false);assert.equal(unavailable.lookup(step),null);
  unavailable.stage(step,{...reused.result,processCleanup:{status:'clean'}},reused.origin);
  const inMemory=unavailable.commit(snapshot,true);assert.equal(inMemory.records.length,1);
  const inMemoryPhase={...reused.result,disposition:'executed'};
  await assertPluginSourcePhaseProof({productRoot:backend,step,store:unavailable,record:inMemory.records[0],snapshot,current:snapshot,phase:inMemoryPhase,fresh:true});
  await assert.rejects(assertPluginSourcePhaseProof({productRoot:backend,step,store:unavailable,record:inMemory.records[0],snapshot,current:snapshot,phase:{...reused.result}}),{code:'verification-proof-invalidated'});
  unavailable.stage(step,failedResult,reused.origin);
  await assert.rejects(assertPluginSourcePhaseProof({productRoot:backend,step,store:unavailable,record:inMemory.records[0],snapshot,current:snapshot,phase:inMemoryPhase,fresh:true}),{code:'verification-proof-invalidated'});
  assert.equal(inMemoryPhase.childOutcome,'passed');assert.equal(inMemoryPhase.childExitCode,0);
  // The plugin content capture alone cannot detect a changed backend input.
  writeFileSync(join(backend,'runtime.ts'),'export const changed = true;\n');
  const drifted=collectVerificationReuseSnapshot({productRoot:backend,env});drifted.environment.tools.sdk=pluginSourceSdkKey(pluginRoot);
  await assert.rejects(assertPluginSourcePhaseProof({productRoot:backend,step,store:fresh,record:accepted.records[0],snapshot,current:drifted,phase:freshPhase}),{code:'source-input-drift'});
  assert.equal(freshPhase.childOutcome,'passed');assert.equal(freshPhase.childExitCode,0);
  writeFileSync(join(pluginRoot,'test/integration/fixture.test.ts'),readFileSync(join(pluginRoot,'test/integration/fixture.test.ts'),'utf8')+'// source changed\n');
  assert.equal((await collectPluginSourceVerificationBundle({pluginRoot,env,imports:bundle})).records.length,0);
});
