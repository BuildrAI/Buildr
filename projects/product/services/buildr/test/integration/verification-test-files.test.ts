import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { INTEGRATION_PRIMARY_SLICES, verificationSteps } from '../verification/registry.ts';
import { auditNodeTestFileOwnership, resolveNodeTestFiles } from '../verification/test-files.ts';
import { auditServiceTestOwnership, serviceOwnershipClaims } from '../verification/test-inventory-ownership.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('node-test selectors resolve sorted files and fail closed when empty', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-test-files-'));
  try {
    fs.mkdirSync(path.join(root, 'test'), { recursive: true });
    fs.writeFileSync(path.join(root, 'test', 'b.test.mjs'), '');
    fs.writeFileSync(path.join(root, 'test', 'a.test.mjs'), '');
    fs.mkdirSync(path.join(root, 'test', 'directory.test.mjs'));
    assert.deepEqual(resolveNodeTestFiles(root, ['test/*.test.mjs']).map((file: any) => path.basename(file)), ['a.test.mjs', 'b.test.mjs']);
    assert.throws(() => resolveNodeTestFiles(root, ['missing/*.test.mjs'], 'fixture-step'), /fixture-step resolved no test files/);
    assert.throws(() => resolveNodeTestFiles(root, ['test/directory.test.mjs']), /resolved no test files/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('registry 中每个显式 node-test 文件都必须真实存在', () => {
  for (const step of verificationSteps.filter((candidate: any) => ['node-test', 'node-context-test'].includes(candidate.executor.type))) {
    for (const selector of step.executor.files) {
      assert.doesNotThrow(
        () => resolveNodeTestFiles(serviceRoot, [selector], step.id),
        `${step.id} 声明了不存在的测试文件 ${selector}`,
      );
    }
  }
});

test('test inventory rejects unowned, duplicated and stale members while retaining declared supporting coverage', () => {
  const inventory = ['one.test.ts', 'two.test.ts'];
  const primary = { id: 'primary', files: [...inventory] };
  assert.equal(auditNodeTestFileOwnership(inventory, [primary]).ok, true);
  assert.equal(auditNodeTestFileOwnership(inventory, [primary, { id: 'platform', files: ['one.test.ts'], supportingFiles: ['one.test.ts'] }]).ok, true);
  assert.equal(auditNodeTestFileOwnership(inventory, [{ id: 'partial', files: ['one.test.ts'] }]).findings[0]?.code, 'test_primary_owner_missing');
  assert.equal(auditNodeTestFileOwnership(inventory, [primary, { id: 'duplicate', files: ['one.test.ts'] }]).findings[0]?.code, 'test_primary_owner_duplicated');
  assert.equal(auditNodeTestFileOwnership(inventory, [primary, { id: 'stale', files: ['missing.test.ts'] }]).findings[0]?.code, 'selected_test_missing');
  assert.equal(auditNodeTestFileOwnership(inventory, [{ ...primary, supportingFiles: ['missing.test.ts'] }]).findings[0]?.code, 'supporting_file_not_selected');
});

function inventoryTests(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? inventoryTests(target) : /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name) ? [target] : [];
  }).sort();
}

test('complete Buildr test inventory has one primary owner, including wrapped release and Browser entries', () => {
  const audit = auditServiceTestOwnership(serviceRoot);
  assert.deepEqual(audit.findings, [], JSON.stringify(audit.findings));
  const browser = verificationSteps.find((step: any) => step.id === 'artifact-browser-core');
  const browserEntry = fs.readFileSync(path.join(serviceRoot, browser.executor.file), 'utf8');
  for (const file of browser.executor.discoveredFiles) assert.ok(browserEntry.includes(file), `Browser wrapper must actually call ${file}`);
});

test('complete source Integration covers every member through its unique real primary owner', () => {
  const byId = new Map<string, any>(verificationSteps.map((step: any) => [step.id, step]));
  const allClaims = serviceOwnershipClaims(serviceRoot);
  const artifactFiles = new Set(allClaims.filter(claim => byId.get(claim.id)?.target === 'artifact').flatMap(claim => claim.files));
  const inventory = inventoryTests(path.join(serviceRoot, 'test/integration')).filter(file => !artifactFiles.has(file));
  const claims = allClaims.filter(claim => byId.get(claim.id)?.target === 'source' && byId.get(claim.id)?.testing.executionBoundary === 'Integration');
  const inIntegration = (file: string) => file.includes(`${path.sep}test${path.sep}integration${path.sep}`);
  assert.deepEqual(auditNodeTestFileOwnership(inventory, claims.map(claim => ({ ...claim,
    files: claim.files.filter(inIntegration), supportingFiles: claim.supportingFiles.filter(inIntegration) }))).findings, []);
  for (const slice of INTEGRATION_PRIMARY_SLICES) {
    const step = verificationSteps.find((item: any) => item.id === slice.id);
    assert.equal(step.testing.primaryEvidenceOwner, slice.id);
    assert.deepEqual(step.executor.files, slice.files);
    for (const file of slice.files) assert.ok(step.inputs.includes(file), `${slice.id} must own its actual executing file ${file}`);
  }
  assert.equal(verificationSteps.some((step: any) => step.profiles.includes('candidate') && step.executor.file === 'test/verification/integration.ts'), false);
});

test('native Windows selection keeps every declared platform test while its shared Worktree subset stays supporting', () => {
  const step = verificationSteps.find((item: any) => item.id === 'integration-windows-native');
  const selector = step.executor.args.find((arg: string) => arg.startsWith('--test-name-pattern='));
  const pattern = new RegExp(selector.slice(selector.indexOf('=') + 1), 'u');
  for (const file of step.executor.files.filter((file: string) => !step.executor.supportingFiles.includes(file))) {
    const titles = [...fs.readFileSync(path.join(serviceRoot, file), 'utf8').matchAll(/\btest\(\s*['"]([^'"\n]+)['"]/gu)].map(match => match[1]!);
    assert.ok(titles.length > 0, file);
    for (const title of titles) assert.ok(pattern.test(title), `${file}: native test would be silently filtered: ${title}`);
  }
});

test('Web and DSH complete entries discover every service-owned test file exactly once', async () => {
  const webRoot = path.resolve(serviceRoot, '../buildr-web');
  const { logicTestArguments } = await import(new URL('../../../buildr-web/tools/run-logic-tests.mjs', import.meta.url).href);
  const webFiles = logicTestArguments(webRoot, 1).filter((file: string) => /\.test\.mjs$/u.test(file));
  assert.deepEqual(auditNodeTestFileOwnership(inventoryTests(path.join(webRoot, 'test')), [{ id: 'frontend-logic', files: webFiles }]).findings, []);
  const pluginRoot = path.resolve(serviceRoot, '../dsh-plugin');
  const { pluginSourcePhaseFiles, PLUGIN_PEER_PHASE_FILES } = await import(new URL('../../../dsh-plugin/tools/verify-all.ts', import.meta.url).href);
  const uiConfig = fs.readFileSync(path.join(pluginRoot, 'test/integration/source-ui.vitest.config.ts'), 'utf8');
  const uiFiles = [...uiConfig.matchAll(/['"]([^'"\n]+\.spec\.tsx)['"]/gu)].map(match => path.join(pluginRoot, 'test/integration', match[1]!));
  const claims = [
    ...['static', 'unit', 'integration', 'e2e'].map(group => ({ id: `dsh-plugin:${group}`, files: pluginSourcePhaseFiles(group, pluginRoot).map((file: string) => path.join(pluginRoot, file)) })),
    { id: 'dsh-plugin:peer-gateway', files: PLUGIN_PEER_PHASE_FILES.map((file: string) => path.join(pluginRoot, file)) },
    { id: 'dsh-plugin:source-ui', files: uiFiles },
  ];
  assert.ok(uiFiles.length > 0, 'the real Vitest entry must select a UI specification');
  assert.deepEqual(auditNodeTestFileOwnership(inventoryTests(path.join(pluginRoot, 'test')), claims).findings, []);
});

test('Agent integration groups conserve discovery and select their real boundaries exactly once', async () => {
  const { agentIntegrationChecks } = await import('../../../buildr-agent/tools/testing/verification-checks.ts');
  const { createVerificationPlan } = await import('../verification/planner.ts');
  const { CANDIDATE_CI_SHARDS } = await import('../verification/registry.ts');
  const agentRoot = path.resolve(serviceRoot, '../buildr-agent');
  const inventory = resolveNodeTestFiles(agentRoot, ['test/integration/**/*.test.ts']);
  const claims = agentIntegrationChecks.map(check => ({ id: check.id, files: resolveNodeTestFiles(agentRoot, check.testFiles) }));
  assert.deepEqual(auditNodeTestFileOwnership(inventory, claims).findings, []);
  for (const check of agentIntegrationChecks) {
    const plan = createVerificationPlan({types:['Integration'],stepIds:[check.id]});
    assert.deepEqual(plan.steps.map((step: any) => step.id), [check.id]);
    const step = plan.steps[0];
    assert.deepEqual(resolveNodeTestFiles(agentRoot, step.executor.discoveredFiles.map((file: string) => path.relative(agentRoot, path.resolve(serviceRoot,file)))), claims.find(claim => claim.id === check.id)!.files);
    assert.ok(step.schedulingCostMs > 0);
    if (check.id.includes('startup') || check.id.includes('handoff') || check.id.includes('recovery')) {
      assert.equal(step.resourceDemand.workers, 1);
      assert.deepEqual(step.resources, ['agent-process-tests']);
    }
  }
  const candidate = CANDIDATE_CI_SHARDS.find((shard: any) => shard.id === 'agent-service-macos');
  for (const check of agentIntegrationChecks) assert.equal(candidate.stepIds.filter((id: string) => id === check.id).length, 1);
  assert.ok(!candidate.stepIds.includes('agent-service'));
});

test('Agent test safety ceiling honors smaller outer grants and rejects invalid budgets', async () => {
  const { serviceTestArguments } = await import('../../tools/testing/run-service-tests.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'agent-test-arguments-'));
  try {
    for (const name of ['one','two','three']) fs.writeFileSync(path.join(root,name+'.test.mjs'),'');
    for (const [budget, expected] of [['1',1],['2',2],['8',2]] as const) {
      const args = serviceTestArguments(['*.test.mjs'], {cwd:root,maximumWorkers:2,env:{BUILDR_VERIFICATION_WORKER_BUDGET:budget}});
      assert.ok(args.includes(`--test-concurrency=${expected}`));
      assert.equal(args.filter(file => file.endsWith('.test.mjs')).length,3);
    }
    for (const value of ['0','-1','1.5','many']) assert.throws(() => serviceTestArguments(['*.test.mjs'], {
      cwd:root,maximumWorkers:2,env:{BUILDR_VERIFICATION_WORKER_BUDGET:value},
    }), /worker budget/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('real Agent fixture cleanup after failure reaps only its own process and preserves a peer', {timeout: 60_000}, async () => {
  const fixture = await import('../../../buildr-agent/test/support/process-fixture.ts');
  const make = async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),'agent-cleanup-isolation-'));
    const dataRoot=path.join(root,'profile'), workspace=path.join(root,'work'), packageRoot=path.join(root,'package');
    fs.mkdirSync(workspace); fixture.copyPackage(fixture.prepared,packageRoot);
    const source=path.resolve(serviceRoot,'../buildr-agent/test/integration/fixtures/agent-process-entry.mjs');
    fs.copyFileSync(source,path.join(packageRoot,'build/process-fixture.mjs'));
    fs.writeFileSync(path.join(packageRoot,'build/fixture-version.json'),JSON.stringify({version:'cleanup-proof'}));
    const runtime=fixture.prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}), profileId='cleanup-isolation';
    const host=await fixture.actor({dataRoot,workspace,runtime,profileId});
    return {root,dataRoot,workspace,runtime,profileId,host};
  };
  const first=await make(); let peer: Awaited<ReturnType<typeof make>> | undefined;
  try {
    peer=await make(); const peerPid=peer.host.info.identity.pid, firstPid=first.host.info.identity.pid;
    const view=await first.host.call('connections.read',['first']);
    await first.host.call('connections.connect',['first',{expectedRevision:view.revision}]);
    const observer=await fixture.connectAgentProcess({dataRoot:first.dataRoot,profileId:first.profileId,runtime:first.runtime,sourceId:'minimal'});
    const uncertain={...observer,operations:{...observer.operations,connections:{...observer.operations.connections,
      disconnect:async (...args: Parameters<typeof observer.operations.connections.disconnect>)=>{
        await observer.operations.connections.disconnect(...args);
        throw Object.assign(new Error('controlled lost revoke receipt'),{code:'agent_connection_release_unconfirmed'});
      },
    }}};
    await assert.rejects(async () => {
      try { throw new Error('controlled scenario assertion failure'); }
      finally { await fixture.cleanupProcessFixture({...first,observer:uncertain}); }
    }, /controlled scenario assertion failure/);
    assert.equal(fixture.isLive(firstPid),false); assert.equal(fs.existsSync(first.root),false);
    assert.equal(fixture.isLive(peerPid),true);
    const peerView=await peer.host.call('conversations.create',[peer.host.info.scope,{}]);
    assert.equal((await peer.host.call('conversations.read',[peer.host.info.scope,peerView.id])).id,peerView.id);
    assert.ok(fs.existsSync(peer.runtime.entry));
  } finally {
    if (fs.existsSync(first.root)) await fixture.cleanupProcessFixture(first);
    if (peer) await fixture.cleanupProcessFixture(peer);
  }
});

test('service integration diagnostics identify a real timeout while the peer completes and cleanup runs', async t => {
  const { spawnSync } = await import('node:child_process');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-timeout-diagnostics-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const directory=path.join(root,'test/integration');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'timeout.test.mjs'),`import test from 'node:test';
import { once } from 'node:events';import fs from 'node:fs';
const marker=new URL('./owned-marker',import.meta.url);
test('controlled timeout',{timeout:30},async t=>{fs.writeFileSync(marker,'owned');t.after(()=>fs.rmSync(marker,{force:true}));await new Promise(resolve=>setTimeout(resolve,150));});`);
  fs.writeFileSync(path.join(directory,'peer.test.mjs'),`import test from 'node:test';
import { once } from 'node:events';import fs from 'node:fs';
test('peer completes',()=>fs.writeFileSync(new URL('./peer-result',import.meta.url),'preserved'));`);
  const result=spawnSync(process.execPath,[path.join(serviceRoot,'tools/testing/run-service-tests.ts'),'test/integration/*.test.mjs'],{
    cwd:root,env:{...process.env,NODE_TEST_CONTEXT:undefined,BUILDR_VERIFICATION_WORKER_BUDGET:'2'},encoding:'utf8',timeout:10_000,
  });
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stdout,/peer completes/);
  const progress=result.stderr.split('\n').filter(line=>line.startsWith('[buildr-integration-progress] ')).map(line=>JSON.parse(line.slice('[buildr-integration-progress] '.length)));
  assert.ok(progress.some(value=>value.file==='timeout.test.mjs'&&value.status==='started'));
  assert.ok(progress.some(value=>value.name==='controlled timeout'&&value.error?.timeout===true));
  assert.equal(fs.existsSync(path.join(directory,'owned-marker')),false);
  assert.equal(fs.readFileSync(path.join(directory,'peer-result'),'utf8'),'preserved');
});

test('lost fixture shutdown response is settled only after the owned process actually exits', async t => {
  const { fork } = await import('node:child_process');
  const { shutdownFixtureProcess, isLive } = await import('../../../buildr-agent/test/support/process-fixture.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-shutdown-receipt-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const entry=path.join(root,'server.mjs');
  fs.writeFileSync(entry,`import {createServer} from 'node:http';
const server=createServer((req,res)=>{res.destroy();server.close();setTimeout(()=>process.exit(0),100);});
server.listen(0,'127.0.0.1',()=>process.send({origin:'http://127.0.0.1:'+server.address().port}));`);
  const child=fork(entry,{stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,NODE_TEST_CONTEXT:undefined}});
  t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
  const [message]=await once(child,'message');
  assert.equal(isLive(child.pid!),true);
  await shutdownFixtureProcess({origin:message.origin,token:'fixture',identity:{pid:child.pid!,generation:'fixture'}} as any);
  assert.equal(isLive(child.pid!),false);
});

test('complete Agent entry follows every registered group and explicit checks select only the requested group', async () => {
  const { spawnSync } = await import('node:child_process');
  const { agentIntegrationChecks } = await import('../../../buildr-agent/tools/testing/verification-checks.ts');
  const entry=path.resolve(serviceRoot,'../buildr-agent/tools/testing/run-integration.ts');
  for (const requested of [[],['--check','agent-integration-recovery']]) {
    const result=spawnSync(process.execPath,[entry,...requested,'--json'],{
      env:{...process.env,NODE_TEST_CONTEXT:undefined},encoding:'utf8',timeout:10_000,
    });
    assert.equal(result.status,0,result.stderr);
    const plan=JSON.parse(result.stdout);
    assert.deepEqual(plan.steps.map((step: any)=>step.id).sort(),
      requested.length ? ['agent-integration-recovery'] : agentIntegrationChecks.map(check=>check.id).sort());
  }
});
