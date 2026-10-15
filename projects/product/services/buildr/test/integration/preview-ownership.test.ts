import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

import { assertPreviewStopOwner, previewDataRoot, readPreviewOwner, startPreview, stopPreview, type PreviewCaller, type PreviewOwner, type PreviewRuntime } from '../../src/web/application/preview-lifecycle.ts';

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
        server.close(() => process.exit(0));
      } else { res.end(JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: mode === 'unhealthy' ? 'starting' : 'ready' })); }
    });
    server.listen(0, '127.0.0.1', () => {
      fs.writeFileSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'), JSON.stringify({
        schemaVersion: 'buildr.local-app-instance/v1', pid: process.pid,
        url: 'http://127.0.0.1:' + server.address().port, secret: 'fixture-secret',
      }));
    });
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
  return { target, dataRoot, pidFile, runtime, start(options: { startupTimeoutMs?: number } = {}) {
    return startPreview(runtime, 'demo', ['--target', target, '--no-open'], { dataRoot, ...options });
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

// Task preview workspace store seeding: the preview serves the worktree root, so its
// local structured store must be seeded from canonical once, then reused untouched.
function taskStoreFixture(t: test.TestContext, { withCanonicalStore = true }: { withCanonicalStore?: boolean } = {}) {
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
  fs.writeFileSync(worker, `
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
const server = http.createServer((req, res) => {
  if (req.headers['x-buildr-instance'] !== 'fixture-secret') { res.writeHead(403).end(); return; }
  if (req.method === 'POST') { res.writeHead(202).end(); server.close(() => process.exit(0)); }
  else res.end(JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready' }));
});
server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'), JSON.stringify({
    schemaVersion: 'buildr.local-app-instance/v1', pid: process.pid,
    url: 'http://127.0.0.1:' + server.address().port, secret: 'fixture-secret',
  }));
});
`);
  const runtime: PreviewRuntime = {
    assertNoUnknownOptions() {},
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
    start() { return startPreview(runtime, 'task-demo', ['--target', canonical, '--task', 'demo-task', '--no-open'], { dataRoot }); } };
}

test('task preview seeds the workspace store into the worktree once and reuses it', { timeout: 20_000 }, async (t) => {
  const fixture = taskStoreFixture(t);
  const result = await fixture.start();
  assert.equal(result.status, 'started');
  assert.deepEqual(result.owner.taskStore, { source: 'canonical', seeded: true });
  assert.equal(result.owner.workspaceRoot, fixture.canonical);
  const storeFile = fixture.seededStore();
  assert.equal(fs.existsSync(storeFile), true);
  const seeded = new DatabaseSync(storeFile, { readOnly: true });
  assert.equal(seeded.prepare('SELECT note FROM marker WHERE id = 1').get()?.note, 'canonical');
  seeded.close();

  // An existing local copy is authoritative for the preview target; canonical is not re-copied.
  const replaced = new DatabaseSync(storeFile);
  replaced.exec("DELETE FROM marker; INSERT INTO marker VALUES (2, 'worktree-local');");
  replaced.close();
  const canonicalDb = new DatabaseSync(path.join(fixture.canonical, '.buildr', 'local', 'workspace.sqlite'));
  canonicalDb.exec("INSERT INTO marker VALUES (3, 'new-canonical-write');");
  canonicalDb.close();
  const reused = await fixture.start();
  assert.equal(reused.status, 'reused');
  const kept = new DatabaseSync(storeFile, { readOnly: true });
  assert.equal(kept.prepare('SELECT note FROM marker WHERE id = 2').get()?.note, 'worktree-local');
  assert.equal(kept.prepare('SELECT note FROM marker WHERE id = 3').get(), undefined);
  kept.close();
  await stopPreview('task-demo', {
    dataRoot: fixture.dataRoot,
    caller: {
      taskId: 'demo-task', workspaceRoot: fixture.canonical, worktree: fixture.worktree,
      worktreeEvidencePath: path.join(fixture.target, 'evidence.json'), worktreePlanDigest: 'sha256-' + 'b'.repeat(64),
    },
  });
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

test('task preview 拒绝 source 与 target 的数据库、父目录及 sidecar 链接，另一位置保持零写入', async (t) => {
  for (const owner of ['source', 'target']) {
    for (const linked of ['local', 'database', 'hard-link', '-wal', '-shm', '-journal']) {
      await t.test(`${owner} ${linked}`, async child => {
        const fixture = taskStoreFixture(child);
        const foreign = path.join(fixture.target, 'foreign', '.buildr', 'local');
        fs.mkdirSync(foreign, { recursive: true });
        const external = path.join(foreign, 'external-file');
        fs.writeFileSync(external, Buffer.from([0, 1, 2, 255]));
        const root = owner === 'source' ? fixture.canonical : fixture.worktree;
        const local = path.join(root, '.buildr', 'local');
        fs.mkdirSync(local, { recursive: true });
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
  }
});

test('task preview 已有目标也检查其真实路径，不把 canonical 库链接当作自身副本', async t => {
  const fixture = taskStoreFixture(t);
  const local = path.dirname(fixture.seededStore());
  fs.mkdirSync(local, { recursive: true });
  const source = path.join(fixture.canonical, '.buildr', 'local', 'workspace.sqlite');
  const before = fs.readFileSync(source);
  fs.symlinkSync(source, fixture.seededStore(), 'file');
  await assert.rejects(fixture.start(), error => coded(error, 'workspace_store_path_invalid'));
  assert.deepEqual(fs.readFileSync(source), before);
  assert.equal(fs.existsSync(fixture.pidFile), false);
});

test('task preview 快照期间出现合法已有目标时复用且不覆盖其内容', { timeout: 20000 }, async t => {
  const fixture = taskStoreFixture(t);
  const execute = DatabaseSync.prototype.exec;
  let created = false;
  t.mock.method(DatabaseSync.prototype, 'exec', function (this: DatabaseSync, sql: string) {
    const result = execute.call(this, sql);
    if (sql.startsWith('VACUUM INTO ')) {
      const other = new DatabaseSync(fixture.seededStore());
      try { other.exec("CREATE TABLE marker(id INTEGER PRIMARY KEY, note TEXT); INSERT INTO marker VALUES (2, 'other-preview');"); }
      finally { other.close(); }
      created = true;
    }
    return result;
  });
  const result = await fixture.start();
  assert.equal(created, true);
  assert.deepEqual(result.owner.taskStore, { source: 'existing', seeded: false });
  const target = new DatabaseSync(fixture.seededStore(), { readOnly: true });
  try {
    assert.equal(target.prepare('SELECT note FROM marker WHERE id = 2').get()?.note, 'other-preview');
    assert.equal(target.prepare('SELECT note FROM marker WHERE id = 1').get(), undefined);
  } finally { target.close(); }
  assert.equal(fs.readdirSync(path.dirname(fixture.seededStore())).some(name => name.includes('.seed-')), false);
  await stopPreview('task-demo', {
    dataRoot: fixture.dataRoot,
    caller: { taskId: 'demo-task', workspaceRoot: fixture.canonical, worktree: fixture.worktree, worktreeEvidencePath: path.join(fixture.target, 'evidence.json'), worktreePlanDigest: 'sha256-' + 'b'.repeat(64) },
  });
});

test('task preview 不接管或删除随机临时名上已有的未知文件', async t => {
  const fixture = taskStoreFixture(t);
  fs.mkdirSync(path.dirname(fixture.seededStore()), { recursive: true });
  t.mock.method(crypto, 'randomBytes', () => Buffer.alloc(4));
  const staging = `${fixture.seededStore()}.seed-${process.pid}-00000000`;
  fs.writeFileSync(staging, 'unknown content\n');
  const before = fs.readFileSync(staging);
  await assert.rejects(fixture.start(), error => coded(error, 'workspace_store_path_invalid'));
  assert.deepEqual(fs.readFileSync(staging), before);
  assert.equal(fs.existsSync(fixture.seededStore()), false);
  assert.equal(fs.existsSync(fixture.pidFile), false);
});

test('task preview 快照临时文件被普通文件替换时拒绝发布并保留替换文件', async t => {
  const fixture = taskStoreFixture(t);
  const execute = DatabaseSync.prototype.exec;
  let staging = '';
  t.mock.method(DatabaseSync.prototype, 'exec', function (this: DatabaseSync, sql: string) {
    const result = execute.call(this, sql);
    if (sql.startsWith('VACUUM INTO ')) {
      staging = sql.slice("VACUUM INTO '".length, -1).replaceAll("''", "'");
      fs.renameSync(staging, `${staging}.original`);
      fs.writeFileSync(staging, 'replacement content\n');
    }
    return result;
  });
  await assert.rejects(fixture.start(), error => {
    assert.equal(coded(error, 'workspace_store_path_invalid'), true);
    assert.equal(error instanceof Error && 'previewStoreCleanupError' in error, true);
    return true;
  });
  assert.ok(staging);
  assert.equal(fs.readFileSync(staging, 'utf8'), 'replacement content\n');
  assert.equal(fs.existsSync(fixture.seededStore()), false);
  assert.equal(fs.existsSync(fixture.pidFile), false);
});

test('task preview 快照完成后 target 目录被替换，不发布或清理另一位置的同名临时文件', async t => {
  const fixture = taskStoreFixture(t);
  const local = path.dirname(fixture.seededStore());
  const foreign = path.join(fixture.target, 'foreign');
  fs.mkdirSync(foreign);
  const execute = DatabaseSync.prototype.exec;
  let foreignTemporary = '';
  t.mock.method(DatabaseSync.prototype, 'exec', function (this: DatabaseSync, sql: string) {
    const result = execute.call(this, sql);
    if (sql.startsWith('VACUUM INTO ')) {
      const staging = sql.slice("VACUUM INTO '".length, -1).replaceAll("''", "'");
      fs.renameSync(local, `${local}.original`);
      fs.symlinkSync(foreign, local, 'dir');
      foreignTemporary = path.join(foreign, path.basename(staging));
      fs.writeFileSync(foreignTemporary, 'foreign content\n');
    }
    return result;
  });
  await assert.rejects(fixture.start(), error => {
    assert.equal(coded(error, 'workspace_store_path_invalid'), true);
    assert.equal(error instanceof Error && 'previewStoreCleanupError' in error, true);
    return true;
  });
  assert.ok(foreignTemporary);
  assert.equal(fs.readFileSync(foreignTemporary, 'utf8'), 'foreign content\n');
  assert.deepEqual(fs.readdirSync(foreign), [path.basename(foreignTemporary)]);
  assert.equal(fs.existsSync(path.join(foreign, 'workspace.sqlite')), false);
  assert.equal(fs.existsSync(fixture.pidFile), false);
});

test('task preview 快照失败只清理本次生成的临时文件，不创建目标或改变 source', async t => {
  const fixture = taskStoreFixture(t);
  const source = path.join(fixture.canonical, '.buildr', 'local', 'workspace.sqlite');
  const before = fs.readFileSync(source);
  const execute = DatabaseSync.prototype.exec;
  t.mock.method(DatabaseSync.prototype, 'exec', function (this: DatabaseSync, sql: string) {
    if (sql.startsWith('VACUUM INTO ')) throw new Error('snapshot failed');
    return execute.call(this, sql);
  });
  await assert.rejects(fixture.start(), error => coded(error, 'preview_task_store_unavailable'));
  assert.deepEqual(fs.readFileSync(source), before);
  assert.deepEqual(fs.readdirSync(path.dirname(fixture.seededStore())), []);
  assert.equal(fs.existsSync(fixture.seededStore()), false);
  assert.equal(fs.existsSync(fixture.pidFile), false);
});
