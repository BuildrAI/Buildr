import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { connectAgentProcess, stopAgentProcess } from '@buildr-ai/buildr-agent';

import { previewDataRoot, startPreview, stopPreview, listPreviews, readPreviewOwner, type PreviewRuntime } from '../../src/web/application/preview-lifecycle.ts';
import { defaultWebDataRoot } from '../../src/modules/installation/contracts/web-profile.ts';

function coded(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function fixture(t: test.TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-reuse-')));
  const target = path.join(root, 'target');
  const dataRoot = path.join(root, 'app-data');
  const home = path.join(root, 'home');
  const worker = path.join(root, 'worker.mjs');
  const pidFile = path.join(root, 'worker.pid');
  const reuseOptions = { home, platform: process.platform, env: { LOCALAPPDATA: path.join(home, 'localappdata'), XDG_STATE_HOME: path.join(home, 'state') } as NodeJS.ProcessEnv };
  const developmentRoot = defaultWebDataRoot('development', reuseOptions);
  const modelAccess = path.join(developmentRoot, 'agent-service', 'model-access');
  fs.mkdirSync(modelAccess, { recursive: true });
  fs.writeFileSync(path.join(modelAccess, 'accounts.json'), `${JSON.stringify({
    version: 1,
    preferences: { a: { 'm-enabled': { enabled: true }, 'm-disabled': { enabled: false } } },
    accounts: [{
      id: 'a', identity: 'identity-a', provider: 'fixture', label: 'Fixture', revision: 'r1', enabled: true, status: 'not-authenticated',
      models: [{ id: 'm-enabled', label: 'Enabled' }, { id: 'm-disabled', label: 'Disabled' }],
    }],
  })}\n`);
  t.after(async () => {
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8'));
      try { process.kill(pid, 'SIGKILL'); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
      for (let attempt = 0; attempt < 100; attempt++) {
        try { process.kill(pid, 0); } catch { break; }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  execFileSync('git', ['init', '--quiet', target]);
  execFileSync('git', ['-C', target, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '--allow-empty', '-m', 'fixture']);
  fs.writeFileSync(worker, `
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
const server = http.createServer((req, res) => {
  if (req.headers['x-buildr-instance'] !== 'fixture-secret') { res.writeHead(403).end(); return; }
  if (req.method === 'POST') { res.writeHead(202).end(); setImmediate(() => process.exit(0)); return; }
  res.end(JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: process.pid }));
});
server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'), JSON.stringify({
    schemaVersion: 'buildr.local-app-instance/v1', pid: process.pid,
    url: 'http://127.0.0.1:' + server.address().port, secret: 'fixture-secret',
  }));
});
`);
  const runtime: PreviewRuntime = {
    assertNoUnknownOptions(args, known, flags) {
      for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (flags.has(arg)) continue;
        if (known.has(arg)) { index += 1; continue; }
        throw new Error(`Unknown option: ${arg}`);
      }
    },
    optionValue(args, key, fallback) { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1] || fallback; },
    assertInitializedBuildrWorkspace(value) { return value; },
    currentProductInvocation() { return { command: process.execPath, argsPrefix: [worker] }; },
    productRoot() { return target; },
    assertCanonicalTaskWorkspace(value) { return value; },
    inspectGitWorktrees() { return { status: 'blocked', repositories: [], diagnostic: { code: 'not-used', message: 'not used' } }; },
    readGitWorktreeEvidence() { return { file: '', evidence: { planDigest: '' } }; },
    atomicWriteJson(file, value, options = {}) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, ...options }); },
    removePath(file) { fs.rmSync(file, { force: true }); },
  };
  return {
    root, target, dataRoot, home, developmentRoot, modelAccess, runtime,
    start(args = ['--reuse', 'development']) {
      return startPreview(runtime, 'demo', ['--target', target, '--no-open', ...args], { dataRoot, reuse: reuseOptions });
    },
  };
}

test('preview stop includes its independent backend and refuses purge after uncertain native release', {timeout:30_000}, async t => {
  t.after(async()=>{await connection?.disconnect();await stopAgentProcess({dataRoot:profileRoot}).catch(()=>{});});
  const data=fixture(t),profileRoot=previewDataRoot('demo',data.dataRoot);
  await data.start([]);
  const connection=await connectAgentProcess({dataRoot:profileRoot,profileId:'preview-fixture',sourceId:'minimal'});
  const status=await connection.lifecycle.status();assert.ok(status.identity.pid>0);
  await connection.disconnect();
  await stopPreview('demo',{dataRoot:data.dataRoot,retainOwner:true});
  assert.equal(fs.existsSync(path.join(profileRoot,'agent-service/process/instance.json')),false);
  assert.ok(fs.existsSync(profileRoot));
  const receiptFile=path.join(profileRoot,'agent-service/process/instances',status.identity.generation+'.json');
  const confirmedReceipt=fs.readFileSync(receiptFile,'utf8'),receipt=JSON.parse(confirmedReceipt);
  assert.equal(receipt.identity.instanceId,status.identity.instanceId);assert.equal(receipt.stopped,true);assert.equal(receipt.confirmed,true);
  fs.writeFileSync(receiptFile,JSON.stringify({...receipt,confirmed:false}));
  try {
    // Real process shutdown was proved above; advance only the refusal poll.
    t.mock.timers.enable({apis:['setTimeout']});
    let settled=false;
    const rejected=assert.rejects(stopPreview('demo',{dataRoot:data.dataRoot,purge:true}),error=>coded(error,'agent_process_stop_unconfirmed'));
    void rejected.then(()=>{settled=true;},()=>{settled=true;});
    for(let tick=0;tick<600&&!settled;tick++){await new Promise<void>(resolve=>setImmediate(resolve));t.mock.timers.tick(50);}
    assert.ok(settled,'uncertain generation release must reject within its controlled polling budget');
    await rejected;
  } finally {
    t.mock.timers.reset();
    if(fs.existsSync(receiptFile))fs.writeFileSync(receiptFile,confirmedReceipt);
  }
  assert.ok(fs.existsSync(profileRoot));
});

test('预览沿用开发版模型目录并可复用、刷新与彻底清理', { timeout: 30_000 }, async (t) => {
  const data = fixture(t);
  const started = await data.start();
  assert.equal(started.status, 'started');
  assert.equal(started.owner.reuse?.source, 'development');
  assert.deepEqual(started.owner.reuse?.facets, ['model-catalog', 'agent-runtime']);
  assert.equal(started.owner.reuse?.results[0].status, 'seeded');
  const copied = path.join(previewDataRoot('demo', data.dataRoot), 'agent-service', 'model-access', 'accounts.json');
  assert.equal(fs.readFileSync(copied, 'utf8'), fs.readFileSync(path.join(data.modelAccess, 'accounts.json'), 'utf8'));
  const ownerFile = path.join(previewDataRoot('demo', data.dataRoot), 'preview.json');
  assert.equal(fs.readFileSync(ownerFile, 'utf8').includes(data.home), false);
  assert.equal(fs.statSync(path.join(previewDataRoot('demo', data.dataRoot), 'reuse.json')).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(path.join(data.modelAccess, 'accounts.json'), 'utf8').includes('m-enabled'), true);

  const { createAgentService } = await import('@buildr-ai/buildr-agent');
  const service = createAgentService({
    dataRoot: previewDataRoot('demo', data.dataRoot),
    modelProviders: [],
    executors: [],
    resolveWorkspace: () => ({ rootPath: previewDataRoot('demo', data.dataRoot) }),
    assertTask: () => {},
    shutdownTimeoutMs: 500,
  });
  try {
    const catalog = await service.models.catalog.list({ refresh: false });
    const enabled = catalog.models.find((model) => model.modelId === 'm-enabled');
    const disabled = catalog.models.find((model) => model.modelId === 'm-disabled');
    assert.equal(enabled?.enabled, true);
    assert.equal(disabled?.enabled, false);
  } finally {
    await service.close();
  }

  fs.writeFileSync(path.join(data.modelAccess, 'accounts.json'), '{"version":1,"preferences":{},"accounts":[]}\n');
  await stopPreview('demo', { dataRoot: data.dataRoot });
  assert.equal(readPreviewOwner('demo', data.dataRoot), null);
  assert.equal(fs.existsSync(copied), true);

  const reused = await data.start(['--reuse', 'development:model-catalog']);
  assert.equal(reused.owner.reuse?.results[0].status, 'reused');
  assert.match(fs.readFileSync(copied, 'utf8'), /"m-enabled"/);
  assert.equal(reused.owner.reuse?.seededAt, started.owner.reuse?.seededAt);

  const refreshed = await data.start(['--reuse', 'development:model-catalog', '--refresh-reuse']);
  assert.equal(refreshed.owner.reuse?.results[0].status, 'refreshed');
  assert.match(fs.readFileSync(copied, 'utf8'), /"preferences":\{\}/);
  const listed = await listPreviews({ dataRoot: data.dataRoot });
  assert.equal(listed.previews[0]?.owner.reuse?.source, 'development');

  const purged = await stopPreview('demo', { dataRoot: data.dataRoot, purge: true });
  assert.equal(purged.status, 'purged');
  assert.equal(fs.existsSync(previewDataRoot('demo', data.dataRoot)), false);
  assert.equal(readPreviewOwner('demo', data.dataRoot), null);
});

test('无 --reuse 时保持既有隔离启动，非法参数在写入前失败', { timeout: 20_000 }, async (t) => {
  const data = fixture(t);
  const plain = await data.start([]);
  assert.equal(plain.owner.reuse, undefined);
  assert.equal(fs.existsSync(path.join(previewDataRoot('demo', data.dataRoot), 'agent-service', 'model-access')), false);
  await stopPreview('demo', { dataRoot: data.dataRoot, purge: true });

  for (const args of [['--reuse', 'released'], ['--reuse', 'development:unknown'], ['--refresh-reuse']]) {
    await assert.rejects(data.start(args), (error) => coded(error, 'preview_reuse_invalid'));
    assert.equal(fs.existsSync(path.join(previewDataRoot('demo', data.dataRoot), 'agent-service', 'model-access')), false);
  }
  fs.rmSync(data.developmentRoot, { recursive: true, force: true });
  await assert.rejects(data.start(['--reuse', 'development']), (error) => coded(error, 'preview_reuse_source_unavailable'));
});

test('purge 拒绝错误 owner、未确认停止、越界符号链接并保留现场', { timeout: 20_000 }, async (t) => {
  const data = fixture(t);
  const started = await data.start(['--reuse', 'development:model-catalog']);
  const directory = previewDataRoot('demo', data.dataRoot);
  const taskOwner = {
    ...started.owner,
    identityMode: 'task-worktree-v1',
    taskId: 'task-a',
    workspaceRoot: data.root,
    worktreeEvidencePath: '/tmp/other.json',
    worktreePlanDigest: 'other',
  };
  fs.writeFileSync(path.join(directory, 'preview.json'), JSON.stringify(taskOwner));
  await assert.rejects(stopPreview('demo', {
    dataRoot: data.dataRoot,
    purge: true,
    caller: { taskId: 'other', workspaceRoot: data.root, worktree: data.target, worktreeEvidencePath: '/tmp/other.json', worktreePlanDigest: 'other' },
  }), (error) => coded(error, 'preview_stop_owner_mismatch'));
  assert.equal(fs.existsSync(directory), true);
  fs.writeFileSync(path.join(directory, 'preview.json'), JSON.stringify(started.owner));

  fs.writeFileSync(path.join(directory, 'instance.json'), JSON.stringify({ schemaVersion: 'buildr.local-app-instance/v1', url: 'http://127.0.0.1:1', secret: 'x', pid: process.pid }));
  await assert.rejects(stopPreview('demo', { dataRoot: data.dataRoot, purge: true }), (error) => coded(error, 'preview_stop_unconfirmed'));
  assert.equal(fs.existsSync(directory), true);
  fs.rmSync(path.join(directory, 'instance.json'), { force: true });
  assert.equal(started.status, 'started');

  const outside = path.join(data.root, 'outside');
  fs.mkdirSync(outside, { recursive: true });
  fs.symlinkSync(outside, path.join(directory, 'escape'));
  await assert.rejects(stopPreview('demo', { dataRoot: data.dataRoot, purge: true }), (error) => coded(error, 'preview_purge_unsafe'));
  assert.equal(fs.existsSync(directory), true);
  assert.equal(fs.existsSync(outside), true);
});

test('单个 facet 失败不阻止预览启动并保留其他 facet 结果', { timeout: 20_000 }, async (t) => {
  const data = fixture(t);
  fs.rmSync(data.modelAccess, { recursive: true, force: true });
  const started = await data.start(['--reuse', 'development']);
  assert.equal(started.status, 'started');
  assert.deepEqual(started.owner.reuse?.results.map((result) => [result.id, result.status]), [['model-catalog', 'failed'], ['agent-runtime', 'failed']]);
  assert.ok(started.owner.reuse?.results[1].diagnostics.some((entry) => entry.includes('模型目录')));
  assert.equal(fs.existsSync(path.join(previewDataRoot('demo', data.dataRoot), 'agent-service', 'model-access')), false);
  await stopPreview('demo', { dataRoot: data.dataRoot, purge: true });
});
