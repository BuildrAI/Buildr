import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { createExactNodePathEnvironment, findExecutableOnPath, spawnCommandSync } from '../../src/infrastructure/process.ts';
import { insideFilesystemPath, sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { acquireExclusiveFileLock, releaseExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';
import { terminateOwnedProcess } from '../verification/support/owned-process.ts';

function temporary(t: any): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr platform 空格 '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
  return root;
}

test('native command shims preserve arguments and exact Node through Windows PATH', { skip: process.platform !== 'win32' }, t => {
  const root = temporary(t), script = path.join(root, 'arguments.cjs');
  fs.writeFileSync(script, 'process.stdout.write(JSON.stringify({args:process.argv.slice(2),node:process.execPath}))');
  const exact = createExactNodePathEnvironment(process.env, path.dirname(process.execPath));
  for (const extension of ['cmd', 'bat']) {
    const shim = path.join(root, 'probe.' + extension);
    fs.writeFileSync(shim, '@echo off\r\nnode "' + script + '" %*\r\n');
    const command = findExecutableOnPath('probe', { env: { ...exact.env, PATH: root, PATHEXT: '.' + extension.toUpperCase() } });
    assert.ok(command);
    const args = ['plain', 'path with spaces', '中文目录', '', 'left&right'];
    const result = spawnCommandSync(command, args, { env: exact.env, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.args, args);
    assert.ok(sameFilesystemPath(output.node, process.execPath));
  }
});

test('native directory aliases preserve ownership and unlink without escaping', t => {
  const root = temporary(t), owned = path.join(root, 'Owned'), foreign = path.join(root, 'foreign');
  fs.mkdirSync(owned); fs.mkdirSync(foreign);
  fs.writeFileSync(path.join(foreign, 'preserved'), 'foreign');
  const alias = path.join(root, 'alias'), escape = path.join(owned, 'outside');
  fs.symlinkSync(owned, alias, process.platform === 'win32' ? 'junction' : 'dir');
  fs.symlinkSync(foreign, escape, process.platform === 'win32' ? 'junction' : 'dir');
  assert.ok(sameFilesystemPath(owned, alias));
  assert.ok(insideFilesystemPath(alias, path.join(owned, 'missing')));
  assert.equal(insideFilesystemPath(owned, foreign), false);
  if (process.platform === 'win32') {
    assert.ok(sameFilesystemPath(owned.toUpperCase(), owned));
    assert.ok(sameFilesystemPath(path.toNamespacedPath(owned), alias));
  }
  fs.rmSync(escape, { recursive: true });
  assert.equal(fs.readFileSync(path.join(foreign, 'preserved'), 'utf8'), 'foreign');
});

test('native exclusive locks reject another owner and release hard-link publication', t => {
  const root = temporary(t), file = path.join(root, 'owner.lock'), target = path.join(root, 'target');
  const lock = acquireExclusiveFileLock(file, target);
  try {
    assert.throws(() => acquireExclusiveFileLock(file, target, { timeoutMs: 0 }), /lock/i);
  } finally { releaseExclusiveFileLock(lock); }
  const next = acquireExclusiveFileLock(file, target);
  releaseExclusiveFileLock(next);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('owned process tree releases descendant sockets and temporary files', { timeout: 15_000 }, async t => {
  const root = temporary(t);
  const grandchild = `const fs=require('node:fs'); const net=require('node:net'); fs.openSync(${JSON.stringify(path.join(root, 'open-file'))},'w'); const server=net.createServer(); server.listen(0,'127.0.0.1',()=>process.send({pid:process.pid,port:server.address().port}));`;
  const parent = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','ignore','inherit','ipc']}); child.on('message',message=>process.send(message)); setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['-e', parent], { detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let cleaned = false;
  t.after(async () => { if (!cleaned && child.pid) await terminateOwnedProcess({ pid: child.pid, graceMs: 100 }); });
  const [ready] = await once(child, 'message', { signal: AbortSignal.timeout(5_000) });
  const closed = once(child, 'close');
  const result = await terminateOwnedProcess({ pid: child.pid, processes: [{ pid: ready.pid }], graceMs: 100, confirmMs: 2_000 });
  await closed;
  const diagnostic = JSON.stringify(result);
  t.diagnostic(diagnostic);
  assert.deepEqual(result.forced, [], diagnostic);
  assert.deepEqual(result.remaining, [], diagnostic);
  for (const pid of [child.pid, ready.pid]) {
    assert.ok(Number.isInteger(pid) && pid > 0, diagnostic);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `owned pid ${pid} still exists: ${diagnostic}`);
  }
  const socket = net.createServer();
  socket.listen(ready.port, '127.0.0.1');
  await once(socket, 'listening');
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  fs.rmSync(path.join(root, 'open-file'));
  cleaned = true;
});
