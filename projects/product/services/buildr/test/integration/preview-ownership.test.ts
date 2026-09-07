import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

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
