import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const INSTALLER = path.join(PRODUCT_ROOT, 'scripts', 'install-buildr-cli');

test('CLI installer prefers receipt-bound Node over an unsupported shell default', (t) => {
  if (process.platform === 'win32') return t.skip('POSIX CLI installer 只在 macOS/Linux 验证；Windows 使用 npm cmd shim。');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fakeBin = path.join(root, 'fake-bin');
  const installDir = path.join(root, 'install');
  fs.mkdirSync(fakeBin);
  const fakeNode = path.join(fakeBin, 'node');
  fs.writeFileSync(fakeNode, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v18.0.0; else echo 18; fi\n');
  fs.chmodSync(fakeNode, 0o755);
  const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` };

  const rejected = spawnSync(INSTALLER, ['--install-dir', installDir], { cwd: PRODUCT_ROOT, env, encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Node\.js 24\.15\.0 or newer/);

  const installed = spawnSync(INSTALLER, ['--node-executable', process.execPath, '--install-dir', installDir], { cwd: PRODUCT_ROOT, env, encoding: 'utf8' });
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  assert.equal(fs.realpathSync(path.join(installDir, 'buildr')), path.join(PRODUCT_ROOT, 'scripts', 'run-development-cli'));
});
