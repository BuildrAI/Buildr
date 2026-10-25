import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { acquireExclusiveFileLock, releaseExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';
import { codexFixture } from '../helpers/codex-desktop-fixture.ts';

const applicationUrl = new URL('../../src/modules/codex-desktop/application/codex-desktop-application.ts', import.meta.url).href;
function client(t: test.TestContext, f: ReturnType<typeof codexFixture>, directoryGate = false) {
  const activeFile = path.join(f.base, 'active.json'), gate = path.join(f.base, 'gate'); fs.writeFileSync(activeFile, JSON.stringify([f.registration.id]));
  const source = `
    import fs from 'node:fs';
    import { CodexDesktopApplication } from ${JSON.stringify(applicationUrl)};
    const input = ${JSON.stringify({ dataRoot: f.dataRoot, registration: f.registration, appPath: f.appPath, activeFile, gate, directoryGate })};
    if (input.directoryGate) {
      const link = fs.linkSync; let paused = false;
      fs.linkSync = (from, to) => { try { return link(from, to); } catch (error) {
        if (!paused && error.code === 'EEXIST' && String(to).endsWith('/connections.json.lock')) {
          paused = true; process.send({ event: 'waiting' }); const deadline = Date.now() + 4000;
          while (!fs.existsSync(input.gate)) { if (Date.now() > deadline) throw Error('gate timed out'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); }
        } throw error;
      } };
    }
    const app = new CodexDesktopApplication({dataRoot: input.dataRoot, resolveWorkspace: id => ({rootPath: input.dataRoot, workspace: {id}}), readTaskIdentity: () => null, readOrigin: () => null, readRegistrationActive: id => JSON.parse(fs.readFileSync(input.activeFile, 'utf8')).includes(id)});
    process.send({ event: 'started' });
    try { const connection = await app.connect(input.registration, { appPath: input.appPath, appVersion: '1' }); process.send({ event: 'result', connection }); }
    catch (error) { process.send({ event: 'result', error: { code: error.code, message: error.message } }); }
  `;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', source], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: process.env });
  assert.ok(child.stderr); let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const seen = new Map<string, any>(), waiting = new Map<string, (value: any) => void>();
  child.on('message', (value: any) => { seen.set(value.event, value); waiting.get(value.event)?.(value); waiting.delete(value.event); });
  const event = (name: string) => seen.has(name) ? Promise.resolve(seen.get(name)) : new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child event timeout: ' + name + ' ' + stderr)), 6000); waiting.set(name, value => { clearTimeout(timer); resolve(value); });
  });
  const exited = new Promise<void>((resolve, reject) => child.on('exit', code => code === 0 ? resolve() : reject(new Error(stderr || 'child exit ' + code))));
  t.after(async () => { if (child.exitCode === null) child.kill(); await exited.catch(() => {}); });
  return { child, event, exited, activeFile, gate };
}
for (const release of [true, false]) test('configuration confirmation ' + (release ? 'waits for a short concurrent write' : 'fails a persistent lock without rewriting state'), { timeout: 10_000 }, async t => {
  const f = codexFixture(t), connection = await f.connect(), before = fs.readFileSync(f.connectionsFile, 'utf8'), lock = acquireExclusiveFileLock(f.connectionsFile + '.lock', f.connectionsFile);
  let released = false;
  try {
    const child = client(t, f); await child.event('started'); const started = Date.now();
    if (release) { await delay(150); assert.equal(fs.readFileSync(f.connectionsFile, 'utf8'), before); releaseExclusiveFileLock(lock); released = true; }
    const result = await child.event('result'); await child.exited;
    if (release) { assert.equal(result.connection.id, connection.id); assert.equal(result.connection.status, 'configured'); }
    else { assert.equal(result.error.code, 'codex_local_state_busy'); assert.ok(Date.now() - started >= 750); assert.equal(fs.readFileSync(f.connectionsFile, 'utf8'), before); }
  } finally { if (!released) releaseExclusiveFileLock(lock); }
});
test('registration removed while confirmation waits is rechecked under the connection lock', { timeout: 10_000 }, async t => {
  const f = codexFixture(t); await f.connect(); const before = fs.readFileSync(f.connectionsFile, 'utf8'), lock = acquireExclusiveFileLock(f.connectionsFile + '.lock', f.connectionsFile);
  let released = false;
  try {
    const child = client(t, f); await child.event('started'); await delay(150); fs.writeFileSync(child.activeFile, '[]'); releaseExclusiveFileLock(lock); released = true;
    assert.equal((await child.event('result')).error.code, 'codex_connection_disconnected'); await child.exited; assert.equal(fs.readFileSync(f.connectionsFile, 'utf8'), before);
  } finally { if (!released) releaseExclusiveFileLock(lock); }
});
test('directory replaced during actual lock retry is rejected without even temporary writes through the symlink', { timeout: 10_000 }, async t => {
  const f = codexFixture(t); await f.connect(); const directory = path.dirname(f.connectionsFile), retained = directory + '-retained', outside = path.join(f.base, 'outside'); fs.mkdirSync(outside);
  const before = fs.statSync(outside, { bigint: true }).mtimeNs, lock = acquireExclusiveFileLock(f.connectionsFile + '.lock', f.connectionsFile); let moved = false;
  try {
    const child = client(t, f, true); await child.event('waiting'); fs.renameSync(directory, retained); fs.symlinkSync(outside, directory); moved = true; fs.writeFileSync(child.gate, 'resume');
    assert.equal((await child.event('result')).error.code, 'codex_storage_scope_invalid'); await child.exited;
    assert.deepEqual(fs.readdirSync(outside), []); assert.equal(fs.statSync(outside, { bigint: true }).mtimeNs, before);
  } finally { if (moved) { fs.unlinkSync(directory); fs.renameSync(retained, directory); } releaseExclusiveFileLock(lock); }
});
test('configuration scope changed while confirmation waits is rejected before registration writes', { timeout: 10_000 }, async t => {
  const f = codexFixture(t); await f.connect(); const before = fs.readFileSync(f.connectionsFile, 'utf8'), lock = acquireExclusiveFileLock(f.connectionsFile + '.lock', f.connectionsFile);
  let released = false;
  try {
    const child = client(t, f); await child.event('started'); await delay(150); fs.writeFileSync(path.join(f.home, 'auth.json'), JSON.stringify({ account_id: 'changed-scope' })); releaseExclusiveFileLock(lock); released = true;
    assert.equal((await child.event('result')).error.code, 'codex_connection_scope_changed'); await child.exited; assert.equal(fs.readFileSync(f.connectionsFile, 'utf8'), before);
  } finally { if (!released) releaseExclusiveFileLock(lock); }
});
