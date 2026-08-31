import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import { assertPreviewStopOwner, previewDataRoot, readPreviewOwner, startPreview, stopPreview } from '../../src/web/application/preview-lifecycle.mjs';

const head = 'a'.repeat(40);
const owner = {
  schemaVersion: 'buildr.local-app-preview/v1', instance: 'demo', identityMode: 'task-environment-v2',
  taskId: 'task-a', workspaceRoot: '/tmp/workspace', environmentRoot: '/tmp/task-a', resourceId: 'preview:demo', worktree: '/tmp/task-a',
  resourceProvider: 'local-app-preview', resourceHandle: { instance: 'demo' }, resourceProviderIdentity: `demo:1234:${head}`,
  head, managedProcess: { pid: 1234, url: 'http://127.0.0.1:4321', state: 'healthy' },
  controllerIdentity: 'sha256-legacy-compatibility-field',
};

function caller(overrides = {}) {
  return {
    taskId: owner.taskId,
    workspaceRoot: owner.workspaceRoot,
    environmentRoot: owner.environmentRoot,
    resourceId: owner.resourceId,
    resourceProvider: owner.resourceProvider,
    resourceHandle: owner.resourceHandle,
    resourceProviderIdentity: owner.resourceProviderIdentity,
    ...overrides,
  };
}

test('task preview ownership uses Environment/resource/provider facts and ignores legacy controller hash', () => {
  assert.doesNotThrow(() => assertPreviewStopOwner(owner, caller()));
  assert.doesNotThrow(() => assertPreviewStopOwner(owner, caller({ controllerIdentity: 'sha256-different-manager' })));
  for (const mismatched of [
    caller({ taskId: 'task-b' }),
    caller({ workspaceRoot: '/tmp/other-workspace' }),
    caller({ environmentRoot: '/tmp/task-b' }),
    caller({ resourceId: 'preview:other' }),
    caller({ resourceProvider: 'other-provider' }),
    caller({ resourceHandle: { instance: 'other' } }),
    caller({ resourceProviderIdentity: 'other-provider-identity' }),
  ]) assert.throws(() => assertPreviewStopOwner(owner, mismatched), (error) => error.code === 'preview_stop_owner_mismatch');
  const corruptedOwner = { ...owner, resourceProviderIdentity: 'other-provider-identity' };
  assert.throws(() => assertPreviewStopOwner(corruptedOwner, caller({ resourceProviderIdentity: corruptedOwner.resourceProviderIdentity })), (error) => error.code === 'preview_stop_owner_mismatch');
});

test('Task preview 可在进程停止后暂留 owner，等待 Environment Receipt 资源释放成功', async (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-owner-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const root = previewDataRoot(owner.instance, dataRoot);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'preview.json'), `${JSON.stringify(owner, null, 2)}\n`);

  const stopped = await stopPreview(owner.instance, { dataRoot, caller: caller(), retainOwner: true });
  assert.equal(stopped.status, 'stale_cleaned');
  assert.equal(readPreviewOwner(owner.instance, dataRoot)?.taskId, owner.taskId);

  await stopPreview(owner.instance, { dataRoot, caller: caller() });
  assert.equal(readPreviewOwner(owner.instance, dataRoot), null);
});

// Real subprocess + HTTP boundary, with only the Web worker replaced. This keeps
// startup failure cases deterministic without bootstrapping entire workspaces.
function startupFixture(t, mode) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-start-'));
  const dataRoot = path.join(target, 'app-data');
  const worker = path.join(target, 'worker.mjs');
  const pidFile = path.join(target, 'worker.pid');
  t.after(async () => {
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8'));
      try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
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
      } else { res.end(JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready' })); }
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
  const runtime = {
    assertNoUnknownOptions() {},
    optionValue(args, key, fallback) { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; },
    assertInitializedBuildrWorkspace() {},
    currentProductInvocation() { return { command: process.execPath, argsPrefix: [worker] }; },
    productRoot() { return target; },
    atomicWriteJson(file, value) { fs.writeFileSync(file, JSON.stringify(value)); },
  };
  return { target, dataRoot, pidFile, runtime, start(options = {}) {
    return startPreview(runtime, 'demo', ['--target', target, '--no-open'], { dataRoot, ...options });
  } };
}

function assertProcessExited(pid) {
  assert.throws(() => process.kill(pid, 0), (error) => error.code === 'ESRCH');
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
    assert.equal(error.code, 'preview_start_failed');
    assert.equal(error.details.exitCode, 23);
    assert.match(error.details.diagnostic, /fixture startup failure/);
    assert.match(fs.readFileSync(error.details.logFile, 'utf8'), /fixture startup failure/);
    assertProcessExited(error.details.pid);
    return true;
  });
  assert.equal(readPreviewOwner('demo', fixture.dataRoot), null);
});

test('preview timeout reclaims its worker even when SIGTERM is ignored and leaves a peer intact', { timeout: 20_000 }, async (t) => {
  const peer = startupFixture(t, 'ready');
  const peerResult = await peer.start();
  const fixture = startupFixture(t, 'hang');
  await assert.rejects(fixture.start({ startupTimeoutMs: 3000 }), (error) => {
    assert.equal(error.code, 'preview_start_timeout');
    assert.equal(error.details.phase, 'instance-missing');
    assert.equal(error.details.cleanup, 'terminated');
    assertProcessExited(error.details.pid);
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
    assert.equal(error.code, 'preview_start_failed');
    assert.match(error.message, /ENOENT/);
    assert.equal(error.details.pid, null);
    return true;
  });
  assert.equal(readPreviewOwner('demo', fixture.dataRoot), null);
});
