import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

import { assertNoUnknownOptions } from '../../src/infrastructure/cli-arguments.ts';
import { defaultWebDataRoot } from '../../src/modules/installation/contracts/web-profile.ts';
import { assertPreviewStopOwner, previewDataRoot, readPreviewOwner, resolveTaskPreviewWorktree, startPreview, stopPreview, type PreviewCaller, type PreviewOwner, type PreviewRuntime } from '../../src/web/application/preview-lifecycle.ts';
import { previewCandidateSourceDigest } from '../../src/web/application/preview-candidate.ts';

// Task previews prepare and pin a candidate runtime before launch. The fixture
// provides an already prepared fake package plus a matching freshness marker so
// preparation is reused (no real build) and the worker can report its digest.
function seedPreparedCandidate(productRoot: string): void {
  const agentPackage = path.join(productRoot, 'node_modules', '@buildr-ai', 'buildr-agent');
  fs.mkdirSync(path.join(agentPackage, 'build', 'process'), { recursive: true });
  fs.writeFileSync(path.join(agentPackage, 'package.json'), '{"name":"@buildr-ai/buildr-agent","version":"0.0.0-fixture"}\n');
  fs.writeFileSync(path.join(agentPackage, 'build', 'index.js'), '// fixture public entry\n');
  fs.writeFileSync(path.join(agentPackage, 'build', 'process', 'entry.js'), '// fixture process entry\n');
  fs.mkdirSync(path.join(productRoot, 'web-dist'), { recursive: true });
  fs.writeFileSync(path.join(productRoot, 'web-dist', 'index.html'), '<!doctype html><title>fixture</title>\n');
  const sourceDigest = previewCandidateSourceDigest(productRoot);
  fs.writeFileSync(path.join(productRoot, 'node_modules', '.buildr-preview-candidate.json'),
    `${JSON.stringify({ schemaVersion: 'buildr.local-app-preview-candidate/v1', sourceDigest }, null, 2)}\n`);
}

const head = 'a'.repeat(40);
const owner: PreviewOwner = {
  schemaVersion: 'buildr.local-app-preview/v1', instance: 'demo', identityMode: 'task-worktree-v1',
  taskId: 'task-a', workspaceRoot: '/tmp/workspace', worktree: '/tmp/task-a', repository: '/tmp/workspace',
  worktreeEvidencePath: '/tmp/workspace/.git/buildr/task-worktrees/task-a.json', worktreePlanDigest: 'sha256-plan',
  branch: 'codex/task-a', head, dirty: false, productCheckout: null,
  repositorySet: [{ selector: 'workspace', checkoutPath: '/tmp/task-a', branch: 'codex/task-a', head }],
  managedProcess: { pid: 1234, url: 'http://127.0.0.1:4321', state: 'healthy' },
};

function caller(overrides: Partial<PreviewCaller> = {}): PreviewCaller {
  return {
    taskId: owner.taskId || '',
    workspaceRoot: owner.workspaceRoot || '',
    worktree: owner.worktree,
    worktreeEvidencePath: owner.worktreeEvidencePath || '',
    worktreePlanDigest: owner.worktreePlanDigest || '',
    ...overrides,
  };
}

function coded(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function failure(error: unknown): { code: unknown; message: string; details: Record<string, unknown> } {
  if (!(error instanceof Error) || !('code' in error) || !('details' in error)) throw new Error('Expected a coded error with details.');
  const detailsValue = error.details;
  if (detailsValue === null || typeof detailsValue !== 'object' || Array.isArray(detailsValue)) throw new Error('Expected error details object.');
  return { code: error.code, message: error.message, details: Object.fromEntries(Object.entries(detailsValue)) };
}

test('task preview ownership uses exact Task Worktree evidence', () => {
  assert.doesNotThrow(() => assertPreviewStopOwner(owner, caller()));
  for (const mismatched of [
    caller({ taskId: 'task-b' }),
    caller({ workspaceRoot: '/tmp/other-workspace' }),
    caller({ worktree: '/tmp/task-b' }),
    caller({ worktreeEvidencePath: '/tmp/other.json' }),
    caller({ worktreePlanDigest: 'sha256-other' }),
  ]) assert.throws(() => assertPreviewStopOwner(owner, mismatched), (error) => coded(error, 'preview_stop_owner_mismatch'));
});

test('追加来源后的预览停止核对原成员而非冻结集合摘要', () => {
  const repositorySet = [...owner.repositorySet.map(item => ({ ...item, head: 'b'.repeat(40) })), { selector: 'service:demo/api', checkoutPath: '/tmp/task-a/repositories/api', branch: owner.branch, head }];
  assert.doesNotThrow(() => assertPreviewStopOwner(owner, caller({ worktreePlanDigest: 'expanded-plan', repositorySet })));
  for (const changed of [[], repositorySet.slice(1), [{ ...repositorySet[0], branch: 'codex/other' }], [{ ...repositorySet[0], checkoutPath: '/tmp/other' }]]) {
    assert.throws(() => assertPreviewStopOwner(owner, caller({ repositorySet: changed })), error => coded(error, 'preview_stop_owner_mismatch'));
  }
});

test('失败的新成员不阻止核验和清理原有预览成员', async t => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-expanded-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const runtime = {
    inspectGitWorktrees: () => ({ status: 'blocked', repositories: [{ ...owner.repositorySet[0], state: 'ready' }, { selector: 'service:demo/api', state: 'blocked' }], diagnostic: { code: 'git_worktree_identity_drift', message: 'new member not created' } }),
    readGitWorktreeEvidence: () => ({ file: owner.worktreeEvidencePath, evidence: { workspaceRoot: owner.workspaceRoot, planDigest: 'expanded-plan' } }),
  } as unknown as PreviewRuntime;
  assert.throws(() => resolveTaskPreviewWorktree(runtime, owner.workspaceRoot!, owner.taskId!), error => coded(error, 'git_worktree_identity_drift'));
  const current = resolveTaskPreviewWorktree(runtime, owner.workspaceRoot!, owner.taskId!, { allowPartial: true });
  assert.equal(current.repositorySet.length, 1);
  const directory = previewDataRoot(owner.instance, dataRoot);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'preview.json'), JSON.stringify(owner));
  const stopped = await stopPreview(owner.instance, { dataRoot, caller: caller({ worktreePlanDigest: current.planDigest, repositorySet: current.repositorySet }) });
  assert.equal(stopped.status, 'stale_cleaned');
});

test('Task preview 由预览能力直接清除 owner，不等待 Environment Receipt', async (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-owner-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const root = previewDataRoot(owner.instance, dataRoot);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'preview.json'), `${JSON.stringify(owner, null, 2)}\n`);

  const stopped = await stopPreview(owner.instance, { dataRoot, caller: caller() });
  assert.equal(stopped.status, 'stale_cleaned');
  assert.equal(readPreviewOwner(owner.instance, dataRoot), null);
});

// Real subprocess + HTTP boundary, with only the Web worker replaced. This keeps
// startup failure cases deterministic without bootstrapping entire workspaces.
function startupFixture(t: test.TestContext, mode: string) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-start-'));
  const dataRoot = path.join(target, 'app-data');
  const worker = path.join(target, 'worker.mjs');
  const pidFile = path.join(target, 'worker.pid');
  t.after(async () => {
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8'));
      try { process.kill(pid, 'SIGKILL'); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
      for (let attempt = 0; attempt < 100; attempt++) {
        try { process.kill(pid, 0); } catch { break; }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    fs.rmSync(target, { recursive: true, force: true });
  });
  execFileSync('git', ['init', '--quiet', target]);
  execFileSync('git', ['-C', target, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '--allow-empty', '-m', 'fixture']);
  fs.writeFileSync(worker, `
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
const mode = ${JSON.stringify(mode)};
if (mode === 'exit') { console.error('fixture startup failure'); process.exit(23); }
if (mode === 'hang') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); }
else {
  setTimeout(() => {
    const server = http.createServer((req, res) => {
      if (req.headers['x-buildr-instance'] !== 'fixture-secret') { res.writeHead(403).end(); return; }
      if (req.method === 'POST') {
        res.writeHead(202).end();
        // Exit on the next tick instead of server.close(): an in-flight or
        // keep-alive probe connection can hold close() open past the
        // stop-confirmation window.
        setImmediate(() => process.exit(0));
      } else { res.end(JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: mode === 'unhealthy' ? 'starting' : 'ready', pid: process.pid })); }
    });
    const portIndex = process.argv.indexOf('--port');
    const requested = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 0;
    server.listen(requested || 0, '127.0.0.1', () => {
      fs.writeFileSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'), JSON.stringify({
        schemaVersion: 'buildr.local-app-instance/v1', pid: process.pid,
        url: 'http://127.0.0.1:' + server.address().port, secret: 'fixture-secret',
      }));
    });
    server.on('error', (error) => { console.error('fixture listen failure', error.message); process.exit(24); });
  }, mode === 'slow' ? 5000 : 0);
}
`);
  const runtime: PreviewRuntime = {
    assertNoUnknownOptions() {},
    optionValue(args: string[], key: string, fallback: string | null) { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1] || fallback; },
    assertInitializedBuildrWorkspace(root: string) { return root; },
    currentProductInvocation() { return { command: process.execPath, argsPrefix: [worker] }; },
    productRoot() { return target; },
    assertCanonicalTaskWorkspace(root: string) { return root; },
    inspectGitWorktrees() { return { status: 'blocked', repositories: [], diagnostic: { code: 'not-used', message: 'not used' } }; },
    readGitWorktreeEvidence() { return { file: '', evidence: { planDigest: '' } }; },
    atomicWriteJson(file: string, value: unknown) { fs.writeFileSync(file, JSON.stringify(value)); },
    removePath(file: string) { fs.rmSync(file, { force: true }); },
  };
  return { target, dataRoot, pidFile, runtime, start(options: { startupTimeoutMs?: number; extraArgs?: string[] } = {}) {
    const { extraArgs = [], ...start } = options;
    return startPreview(runtime, 'demo', ['--target', target, '--no-open', '--reuse', 'none', ...extraArgs], { dataRoot, ...start });
  } };
}

function assertProcessExited(pid: number) {
  assert.throws(() => process.kill(pid, 0), (error) => error instanceof Error && 'code' in error && error.code === 'ESRCH');
}

test('preview waits for a healthy slow worker beyond the former four-second polling window', { timeout: 20_000 }, async (t) => {
  const fixture = startupFixture(t, 'slow');
  const result = await fixture.start();
  assert.equal(result.status, 'started');
  assert.equal(result.pid, Number(fs.readFileSync(fixture.pidFile, 'utf8')));
  const reused = await fixture.start();
  assert.equal(reused.status, 'reused');
  assert.equal(reused.pid, result.pid);
  await stopPreview('demo', { dataRoot: fixture.dataRoot });
});

test('preview reports early worker exit and preserves its diagnostic log', async (t) => {
  const fixture = startupFixture(t, 'exit');
  await assert.rejects(fixture.start(), (error) => {
    const observed = failure(error);
    assert.equal(observed.code, 'preview_start_failed');
    assert.equal(observed.details.exitCode, 23);
    assert.match(String(observed.details.diagnostic), /fixture startup failure/);
    assert.match(fs.readFileSync(String(observed.details.logFile), 'utf8'), /fixture startup failure/);
    assertProcessExited(Number(observed.details.pid));
    return true;
  });
  assert.equal(readPreviewOwner('demo', fixture.dataRoot), null);
});

test('preview timeout reclaims its worker even when SIGTERM is ignored and leaves a peer intact', { timeout: 20_000 }, async (t) => {
  const peer = startupFixture(t, 'ready');
  const peerResult = await peer.start();
  const fixture = startupFixture(t, 'hang');
  await assert.rejects(fixture.start({ startupTimeoutMs: 3000 }), (error) => {
    const observed = failure(error);
    assert.equal(observed.code, 'preview_start_timeout');
    assert.equal(observed.details.phase, 'instance-missing');
    assert.equal(observed.details.cleanup, 'terminated');
    assertProcessExited(Number(observed.details.pid));
    return true;
  });
  assert.equal(readPreviewOwner('demo', fixture.dataRoot), null);
  assert.equal((await peer.start()).pid, peerResult.pid);
  await stopPreview('demo', { dataRoot: peer.dataRoot });
});

test('preview spawn failure is reported without an unhandled child error', async (t) => {
  const fixture = startupFixture(t, 'ready');
  fixture.runtime.currentProductInvocation = () => ({ command: path.join(fixture.target, 'missing-executable'), argsPrefix: [] });
  await assert.rejects(fixture.start(), (error) => {
    const observed = failure(error);
    assert.equal(observed.code, 'preview_start_failed');
    assert.match(observed.message, /ENOENT/);
    assert.equal(observed.details.pid, null);
    return true;
  });
  assert.equal(readPreviewOwner('demo', fixture.dataRoot), null);
});

test('preview timeout removes only its exited worker instance record when health never becomes ready', { timeout: 15_000 }, async (t) => {
  const fixture = startupFixture(t, 'unhealthy');
  await assert.rejects(fixture.start({ startupTimeoutMs: 3000 }), (error) => {
    const observed = failure(error);
    assert.equal(observed.code, 'preview_start_timeout');
    assert.equal(observed.details.phase, 'health-not-ready');
    assertProcessExited(Number(observed.details.pid));
    return true;
  });
  assert.equal(fs.existsSync(path.join(previewDataRoot('demo', fixture.dataRoot), 'instance.json')), false);
  assert.equal(readPreviewOwner('demo', fixture.dataRoot), null);
});

// Task preview serves the canonical workspace directly; the fixture provides an
// isolated development data root so the default reuse stays hermetic.
function taskStoreFixture(t: test.TestContext, { withCanonicalStore = true, withDevRoot = true }: { withCanonicalStore?: boolean; withDevRoot?: boolean } = {}) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-task-'));
  const canonical = path.join(target, 'canonical');
  const worktree = path.join(target, 'task-worktree');
  // startPreview 以 canonical 相对路径在 worktree 内定位 product checkout。
  const product = path.join(worktree, 'product');
  const dataRoot = path.join(target, 'app-data');
  const worker = path.join(target, 'worker.mjs');
  const pidFile = path.join(target, 'worker.pid');
  const storeDir = path.join(canonical, '.buildr', 'local');
  fs.mkdirSync(storeDir, { recursive: true });
  if (withCanonicalStore) {
    const source = new DatabaseSync(path.join(storeDir, 'workspace.sqlite'));
    source.exec("CREATE TABLE marker(id INTEGER PRIMARY KEY, note TEXT); INSERT INTO marker VALUES (1, 'canonical');");
    source.close();
  }
  const home = path.join(target, 'home');
  const reuseOptions = { home, platform: process.platform, env: { LOCALAPPDATA: path.join(home, 'localappdata'), XDG_STATE_HOME: path.join(home, 'state') } as NodeJS.ProcessEnv };
  if (withDevRoot) {
    const modelAccess = path.join(defaultWebDataRoot('development', reuseOptions), 'agent-service', 'model-access');
    fs.mkdirSync(modelAccess, { recursive: true });
    fs.writeFileSync(path.join(modelAccess, 'accounts.json'), '{"version":1,"preferences":{},"accounts":[]}\n');
  }
  t.after(async () => {
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8'));
      try { process.kill(pid, 'SIGKILL'); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
      for (let attempt = 0; attempt < 100; attempt++) {
        try { process.kill(pid, 0); } catch { break; }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    fs.rmSync(target, { recursive: true, force: true });
  });
  execFileSync('git', ['init', '--quiet', canonical]);
  execFileSync('git', ['-C', canonical, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '--allow-empty', '-m', 'fixture']);
  execFileSync('git', ['-C', canonical, 'worktree', 'add', '--quiet', '--detach', worktree, 'HEAD']);
  fs.mkdirSync(path.join(product, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(product, 'bin', 'buildr.mjs'), '// fixture cli\n');
  seedPreparedCandidate(product);
  fs.writeFileSync(worker, `
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
const server = http.createServer((req, res) => {
  if (req.headers['x-buildr-instance'] !== 'fixture-secret') { res.writeHead(403).end(); return; }
  if (req.method === 'POST') { res.writeHead(202).end(); setImmediate(() => process.exit(0)); }
  else res.end(JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: process.pid, agentRuntime: { currentDigest: process.env.BUILDR_PREVIEW_AGENT_DIGEST || null, generation: 'fixture-generation', accepting: true, pendingDigest: null } }));
});
server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'), JSON.stringify({
    schemaVersion: 'buildr.local-app-instance/v1', pid: process.pid,
    url: 'http://127.0.0.1:' + server.address().port, secret: 'fixture-secret',
  }));
});
`);
  const runtime: PreviewRuntime = {
    assertNoUnknownOptions,
    optionValue(args: string[], key: string, fallback: string | null) { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1] || fallback; },
    assertInitializedBuildrWorkspace(root: string) { return root; },
    currentProductInvocation() { return { command: process.execPath, argsPrefix: [worker] }; },
    productRoot() { return path.join(canonical, 'product'); },
    assertCanonicalTaskWorkspace(root: string) { return root; },
    inspectGitWorktrees() {
      return {
        status: 'ready',
        repositories: [{ selector: 'workspace', checkoutPath: worktree, branch: 'codex/demo-task', head: 'a'.repeat(40), state: 'ready' }],
        diagnostic: null,
      };
    },
    readGitWorktreeEvidence() {
      return { file: path.join(target, 'evidence.json'), evidence: { planDigest: 'sha256-' + 'b'.repeat(64), workspaceRoot: canonical } };
    },
    atomicWriteJson(file: string, value: unknown) { fs.writeFileSync(file, JSON.stringify(value)); },
    removePath(file: string) { fs.rmSync(file, { force: true }); },
  };
  const seededStore = () => path.join(worktree, '.buildr', 'local', 'workspace.sqlite');
  return { target, canonical, worktree, dataRoot, pidFile, runtime, seededStore,
    start(extra: string[] = []) { return startPreview(runtime, 'task-demo', ['--target', canonical, '--task', 'demo-task', '--no-open', ...extra], { dataRoot, reuse: reuseOptions }); } };
}

test('task preview 默认从工作树运行代码、直接服务 canonical 且不播种副本', async t => {
  const fixture = taskStoreFixture(t);
  const observed = path.join(fixture.target, 'invocation.json');
  const worker = path.join(fixture.target, 'worker.mjs');
  fs.appendFileSync(worker, `\nfs.writeFileSync(${JSON.stringify(observed)}, JSON.stringify({args:process.argv, cwd:process.cwd(), owner:JSON.parse(process.env.BUILDR_LOCAL_APP_PREVIEW)}));\n`);
  const started = await fixture.start();
  const invocation = JSON.parse(fs.readFileSync(observed, 'utf8'));
  assert.equal(invocation.args[invocation.args.indexOf('--target') + 1], fixture.canonical);
  assert.equal(fs.realpathSync(invocation.cwd), fs.realpathSync(fixture.canonical));
  assert.equal(started.owner.worktree, fixture.worktree);
  assert.equal(started.owner.productCheckout, path.join(fixture.worktree, 'product'));
  assert.equal(started.owner.workspaceMode, 'shared');
  assert.equal(started.owner.environmentRoot, fixture.canonical);
  assert.equal(started.owner.taskStore, null);
  assert.equal(started.owner.reuse?.source, 'development');
  assert.deepEqual(started.owner.reuse?.facets, ['model-catalog', 'agent-runtime']);
  assert.equal(fs.existsSync(fixture.seededStore()), false);
  assert.equal(readPreviewOwner('task-demo', fixture.dataRoot)?.environmentRoot, fixture.canonical);
  // 旧模式参数按未知选项失败，不播种、不启动。
  await assert.rejects(fixture.start(['--workspace-mode', 'snapshot']), error => error instanceof Error && error.message.includes('--workspace-mode'));
  assert.equal(fs.existsSync(fixture.seededStore()), false);
  await stopPreview('task-demo', { dataRoot: fixture.dataRoot, caller: {
    taskId: 'demo-task', workspaceRoot: fixture.canonical, worktree: fixture.worktree,
    worktreeEvidencePath: path.join(fixture.target, 'evidence.json'), worktreePlanDigest: 'sha256-' + 'b'.repeat(64),
  } });
});

test('旧 --workspace-mode 参数按未知选项在写入与启动前失败', async t => {
  const fixture = taskStoreFixture(t);
  for (const mode of ['shared', 'snapshot', 'unknown']) {
    await assert.rejects(fixture.start(['--workspace-mode', mode]), error => error instanceof Error && error.message.includes('--workspace-mode'));
  }
  assert.equal(fs.existsSync(previewDataRoot('task-demo', fixture.dataRoot)), false);
  assert.equal(fs.existsSync(fixture.seededStore()), false);
  assert.equal(fs.existsSync(fixture.pidFile), false);
});

test('普通停止保留的快照登记不得无声混入 shared 模式', async t => {
  const fixture = taskStoreFixture(t);
  const first = await fixture.start();
  const root = previewDataRoot('task-demo', fixture.dataRoot);
  const file = path.join(root, 'workspace-registry.json');
  const registry = JSON.stringify({ schemaVersion: 'buildr.local-workspace-registry/v1', roots: [fixture.worktree], lastOpenedRoot: fixture.worktree });
  fs.writeFileSync(file, registry);
  const caller = {
    taskId: 'demo-task', workspaceRoot: fixture.canonical, worktree: fixture.worktree,
    worktreeEvidencePath: path.join(fixture.target, 'evidence.json'), worktreePlanDigest: 'sha256-' + 'b'.repeat(64),
  };
  // A legacy owner has no data-mode fields, but must still be safely stoppable.
  const legacy = { ...first.owner };
  delete legacy.workspaceMode;
  delete legacy.environmentRoot;
  fs.writeFileSync(path.join(root, 'preview.json'), JSON.stringify(legacy));
  assert.equal(readPreviewOwner('task-demo', fixture.dataRoot)?.workspaceMode, 'snapshot');
  await assert.rejects(fixture.start(), error => coded(error, 'preview_owner_conflict'));
  await stopPreview('task-demo', { dataRoot: fixture.dataRoot, caller });
  await assert.rejects(fixture.start(), error => coded(error, 'preview_workspace_mode_conflict'));
  assert.equal(fs.readFileSync(file, 'utf8'), registry);
  // 保留登记清理后，新逻辑实例才能在该实例名上重建。
  fs.rmSync(file);
  await fixture.start();
  await stopPreview('task-demo', { dataRoot: fixture.dataRoot, caller });
});

test('task preview 默认沿用 development，none 清除既有沿用，refresh 单独刷新', { timeout: 20_000 }, async (t) => {
  const fixture = taskStoreFixture(t);
  const caller = {
    taskId: 'demo-task', workspaceRoot: fixture.canonical, worktree: fixture.worktree,
    worktreeEvidencePath: path.join(fixture.target, 'evidence.json'), worktreePlanDigest: 'sha256-' + 'b'.repeat(64),
  };
  const started = await fixture.start();
  assert.equal(started.status, 'started');
  assert.equal(started.owner.workspaceMode, 'shared');
  assert.equal(started.owner.environmentRoot, fixture.canonical);
  assert.equal(started.owner.taskStore, null);
  assert.equal(started.owner.reuse?.source, 'development');
  assert.deepEqual(started.owner.reuse?.facets, ['model-catalog', 'agent-runtime']);
  assert.equal(started.owner.reuse?.results[0].status, 'seeded');
  const reuseFile = path.join(previewDataRoot('task-demo', fixture.dataRoot), 'reuse.json');
  assert.equal(fs.existsSync(reuseFile), true);

  const refreshed = await fixture.start(['--refresh-reuse']);
  assert.equal(refreshed.status, 'reused');
  assert.equal(refreshed.owner.reuse?.results[0].status, 'refreshed');

  await stopPreview('task-demo', { dataRoot: fixture.dataRoot, caller });
  const none = await fixture.start(['--reuse', 'none']);
  assert.equal(none.owner.reuse, undefined);
  assert.equal(fs.existsSync(reuseFile), false);

  await stopPreview('task-demo', { dataRoot: fixture.dataRoot, caller });
  await assert.rejects(fixture.start(['--reuse', 'none', '--refresh-reuse']), error => coded(error, 'preview_reuse_invalid'));
  const again = await fixture.start();
  assert.equal(again.owner.reuse?.source, 'development');
  await stopPreview('task-demo', { dataRoot: fixture.dataRoot, caller });
});

test('开发版沿用来源不可用时默认启动 fail closed 并提示 --reuse none', async t => {
  const fixture = taskStoreFixture(t, { withDevRoot: false });
  await assert.rejects(fixture.start(), (error) => {
    assert.equal(coded(error, 'preview_reuse_source_unavailable'), true);
    assert.match((error as Error).message, /--reuse none/);
    return true;
  });
  assert.equal(readPreviewOwner('task-demo', fixture.dataRoot), null);
  assert.equal(fs.existsSync(fixture.pidFile), false);
  const none = await fixture.start(['--reuse', 'none']);
  assert.equal(none.owner.reuse, undefined);
  await stopPreview('task-demo', { dataRoot: fixture.dataRoot, caller: {
    taskId: 'demo-task', workspaceRoot: fixture.canonical, worktree: fixture.worktree,
    worktreeEvidencePath: path.join(fixture.target, 'evidence.json'), worktreePlanDigest: 'sha256-' + 'b'.repeat(64),
  } });
});

test('正在运行的预览在安全扩展后复用并继续拒绝原成员漂移', { timeout: 20_000 }, async t => {
  const fixture = taskStoreFixture(t);
  const started = await fixture.start();
  const repositories = [...started.owner.repositorySet, { selector: 'service:demo/api', checkoutPath: path.join(fixture.worktree, 'repositories/api'), branch: 'codex/demo-task', head }];
  const previousEvidence = fixture.runtime.readGitWorktreeEvidence(fixture.canonical, 'demo-task');
  fixture.runtime.readGitWorktreeEvidence = () => ({ ...previousEvidence, evidence: { ...previousEvidence.evidence, planDigest: 'expanded-plan' } });
  fixture.runtime.inspectGitWorktrees = () => ({ status: 'ready', repositories: repositories.map(item => ({ ...item, state: 'ready' })), diagnostic: null });
  const reused = await fixture.start();
  assert.equal(reused.status, 'reused');
  assert.equal(reused.url, started.url);
  fixture.runtime.inspectGitWorktrees = () => ({ status: 'ready', repositories: repositories.map(item => ({ ...item, branch: 'codex/other', state: 'ready' })), diagnostic: null });
  await assert.rejects(fixture.start(), error => coded(error, 'preview_owner_conflict'));
  await stopPreview('task-demo', { dataRoot: fixture.dataRoot, caller: { taskId: 'demo-task', workspaceRoot: fixture.canonical, worktree: fixture.worktree, worktreeEvidencePath: previousEvidence.file, worktreePlanDigest: 'expanded-plan', repositorySet: repositories } });
});

test('task preview fails closed when the canonical workspace store is unreadable', async (t) => {
  const fixture = taskStoreFixture(t, { withCanonicalStore: false });
  await assert.rejects(fixture.start(), (error) => {
    const observed = failure(error);
    assert.equal(observed.code, 'preview_task_store_unavailable');
    return true;
  });
  assert.equal(fs.existsSync(fixture.seededStore()), false);
  assert.equal(readPreviewOwner('task-demo', fixture.dataRoot), null);
});

test('task preview 拒绝 canonical 数据源的数据库、父目录及 sidecar 链接，另一位置保持零写入', async (t) => {
  for (const linked of ['local', 'database', 'hard-link', '-wal', '-shm', '-journal']) {
    await t.test(`source ${linked}`, async child => {
      const fixture = taskStoreFixture(child);
      const foreign = path.join(fixture.target, 'foreign', '.buildr', 'local');
      fs.mkdirSync(foreign, { recursive: true });
      const external = path.join(foreign, 'external-file');
      fs.writeFileSync(external, Buffer.from([0, 1, 2, 255]));
      const local = path.join(fixture.canonical, '.buildr', 'local');
      const file = path.join(local, 'workspace.sqlite');
      if (linked === 'local') {
        fs.renameSync(local, `${local}.original`);
        fs.symlinkSync(foreign, local, 'dir');
      } else if (linked === 'database' || linked === 'hard-link') {
        if (fs.existsSync(file)) fs.renameSync(file, `${file}.original`);
        if (linked === 'database') fs.symlinkSync(external, file, 'file');
        else fs.linkSync(external, file);
      } else fs.symlinkSync(external, `${file}${linked}`, 'file');
      const before = fs.readdirSync(foreign).sort().map(name => ({ name, bytes: fs.readFileSync(path.join(foreign, name)).toString('hex') }));
      await assert.rejects(fixture.start(), error => coded(error, 'workspace_store_path_invalid'));
      assert.deepEqual(fs.readdirSync(foreign).sort().map(name => ({ name, bytes: fs.readFileSync(path.join(foreign, name)).toString('hex') })), before);
      assert.equal(readPreviewOwner('task-demo', fixture.dataRoot), null);
      assert.equal(fs.existsSync(fixture.pidFile), false);
    });
  }
});

test('preview restart reuses its remembered port while it stays free', { timeout: 20_000 }, async (t) => {
  const fixture = startupFixture(t, 'ready');
  const first = await fixture.start();
  const firstPort = Number(new URL(first.url).port);
  assert.ok(firstPort > 0);
  await stopPreview('demo', { dataRoot: fixture.dataRoot });
  const second = await fixture.start();
  assert.equal(second.status, 'started');
  assert.equal(Number(new URL(second.url).port), firstPort, 'restart keeps the same loopback port');
  assert.match(second.portNote || '', /复用上次端口/);
  await stopPreview('demo', { dataRoot: fixture.dataRoot });
});

test('an occupied remembered port falls back to a fresh assignment', { timeout: 20_000 }, async (t) => {
  const fixture = startupFixture(t, 'ready');
  const first = await fixture.start();
  const firstPort = Number(new URL(first.url).port);
  await stopPreview('demo', { dataRoot: fixture.dataRoot });
  const squatter = http.createServer().listen(firstPort, '127.0.0.1');
  await new Promise<void>((resolve) => squatter.once('listening', resolve));
  t.after(() => squatter.close());
  const second = await fixture.start();
  assert.notEqual(Number(new URL(second.url).port), firstPort, 'occupied port must not be rebound');
  assert.match(second.portNote || '', /被占用，改用随机端口/);
  await stopPreview('demo', { dataRoot: fixture.dataRoot });
});

test('preview start seeds extra --workspace roots into the instance registry', { timeout: 20_000 }, async (t) => {
  const fixture = startupFixture(t, 'ready');
  const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-ws-'));
  t.after(() => fs.rmSync(extra, { recursive: true, force: true }));
  const result = await fixture.start({ extraArgs: ['--workspace', extra] });
  assert.equal(result.status, 'started');
  const registryFile = path.join(fixture.dataRoot, 'previews', 'demo', 'workspace-registry.json');
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  assert.deepEqual(registry.roots, [fs.realpathSync(extra)]);
  const again = await fixture.start({ extraArgs: ['--workspace', extra] });
  assert.equal(again.status, 'reused');
  const stable = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  assert.deepEqual(stable.roots, [fs.realpathSync(extra)], 'reusing a healthy preview must not reseed');
  await stopPreview('demo', { dataRoot: fixture.dataRoot });
});
