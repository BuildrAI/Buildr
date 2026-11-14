import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acquireExclusiveFileLock, isHardLinkUnsupportedError, releaseExclusiveFileLock, withExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';

function temporary(t: any): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-exclusive-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

/** ENOTSUP is the portable form of the Windows ERROR_INVALID_FUNCTION mapping. */
function unsupportedHardLink(): never {
  throw Object.assign(new Error('operation not supported'), { code: 'ENOTSUP' });
}

test('volumes without hard links still acquire, exclude, verify and release exclusive locks', t => {
  const root = temporary(t), file = path.join(root, 'web-management.json.lock'), target = path.join(root, 'target');
  let attempts = 0;
  t.mock.method(fs, 'linkSync', () => { attempts += 1; unsupportedHardLink(); });

  const owner = acquireExclusiveFileLock(file, target, { timeoutMs: 0 });
  assert.equal(attempts, 1);
  const published = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(published.schemaVersion, 'buildr.exclusive-file-lock/v1');
  assert.equal(published.token, owner.record.token);
  assert.equal(published.target, target);

  assert.throws(() => acquireExclusiveFileLock(file, target, { timeoutMs: 0 }), (error: any) => error.code === 'buildr_exclusive_file_lock_timeout');
  assert.equal(releaseExclusiveFileLock(owner), true);
  assert.deepEqual(fs.readdirSync(root), []);

  const next = acquireExclusiveFileLock(file, target, { timeoutMs: 0 });
  assert.equal(releaseExclusiveFileLock(next), true);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('withExclusiveFileLock publishes, runs and releases without hard links', t => {
  const root = temporary(t), file = path.join(root, 'owner.lock'), target = path.join(root, 'target');
  t.mock.method(fs, 'linkSync', unsupportedHardLink);
  const result = withExclusiveFileLock(file, target, (lock: any) => {
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).token, lock.record.token);
    return 'ran';
  });
  assert.equal(result, 'ran');
  assert.deepEqual(fs.readdirSync(root), []);
});

test('a hard-link-free publication never replaces an existing lock file', t => {
  const root = temporary(t), file = path.join(root, 'owner.lock'), target = path.join(root, 'target');
  const bytes = '{"schemaVersion":"tampered"}\n';
  fs.writeFileSync(file, bytes);
  t.mock.method(fs, 'linkSync', unsupportedHardLink);
  assert.throws(
    () => acquireExclusiveFileLock(file, target, { timeoutMs: 0 }),
    (error: any) => error.code === 'buildr_exclusive_file_lock_timeout' && /invalid-or-unknown/.test(error.message),
  );
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});

test('a failed hard-link-free publication removes only its own claim', t => {
  const root = temporary(t), file = path.join(root, 'owner.lock'), target = path.join(root, 'target');
  t.mock.method(fs, 'linkSync', unsupportedHardLink);
  const write = fs.writeFileSync.bind(fs);
  t.mock.method(fs, 'writeFileSync', (destination: any, data: any, options?: any) => {
    if (typeof destination === 'number') throw Object.assign(new Error('fixture write failure'), { code: 'EIO' });
    return write(destination, data, options);
  });
  assert.throws(
    () => acquireExclusiveFileLock(file, target, { timeoutMs: 0 }),
    (error: any) => error.code === 'buildr_exclusive_file_lock_acquire_failed',
  );
  assert.deepEqual(fs.readdirSync(root), []);
});

test('a hard-link-free publication fails closed when it cannot verify its own record', t => {
  const root = temporary(t), file = path.join(root, 'owner.lock'), target = path.join(root, 'target');
  t.mock.method(fs, 'linkSync', unsupportedHardLink);
  const read = fs.readFileSync.bind(fs);
  t.mock.method(fs, 'readFileSync', (candidate: any, options?: any) => path.resolve(String(candidate)) === file ? '' : read(candidate, options));
  assert.throws(
    () => acquireExclusiveFileLock(file, target, { timeoutMs: 0 }),
    (error: any) => error.code === 'buildr_exclusive_file_lock_publish_unverified',
  );
  assert.deepEqual(fs.readdirSync(root), []);
});

test('hard-link-free locks reclaim a dead owner through the normal rename guard', t => {
  const root = temporary(t), file = path.join(root, 'owner.lock'), target = path.join(root, 'target');
  t.mock.method(fs, 'linkSync', unsupportedHardLink);
  fs.writeFileSync(file, `${JSON.stringify({ schemaVersion: 'buildr.exclusive-file-lock/v1', pid: process.pid, token: 'a'.repeat(32), createdAt: new Date().toISOString(), target })}\n`);
  const reclaimed = acquireExclusiveFileLock(file, target, { timeoutMs: 0, ownerAlive: () => false });
  assert.equal(reclaimed.record.pid, process.pid);
  assert.equal(releaseExclusiveFileLock(reclaimed), true);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('Windows ERROR_INVALID_FUNCTION is recognized as an unsupported hard link', () => {
  assert.equal(isHardLinkUnsupportedError({ code: 'ENOTSUP' }), true);
  assert.equal(isHardLinkUnsupportedError({ code: 'ENOSYS' }), true);
  assert.equal(isHardLinkUnsupportedError({ code: 'EISDIR' }), process.platform === 'win32');
  assert.equal(isHardLinkUnsupportedError({ code: 'EEXIST' }), false);
  assert.equal(isHardLinkUnsupportedError(null), false);
});
