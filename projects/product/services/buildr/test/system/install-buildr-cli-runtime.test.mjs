import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const INSTALLER = path.join(PRODUCT_ROOT, 'scripts', 'install-buildr-cli');
const UNINSTALLER = path.join(PRODUCT_ROOT, 'scripts', 'uninstall-buildr-cli');

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
  assert.match(rejected.stderr, /Node\.js >=24\.15\.0 <25/);

  const futureNode = path.join(fakeBin, 'node-25');
  fs.writeFileSync(futureNode, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v25.0.0; else echo 0; fi\n');
  fs.chmodSync(futureNode, 0o755);
  const futureRejected = spawnSync(INSTALLER, ['--node-executable', futureNode, '--install-dir', installDir], { cwd: PRODUCT_ROOT, env, encoding: 'utf8' });
  assert.equal(futureRejected.status, 1);
  assert.match(futureRejected.stderr, /Node\.js >=24\.15\.0 <25/);

  const installed = spawnSync(INSTALLER, ['--node-executable', process.execPath, '--install-dir', installDir], { cwd: PRODUCT_ROOT, env, encoding: 'utf8' });
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  const command = path.join(installDir, 'buildr');
  assert.equal(fs.lstatSync(command).isSymbolicLink(), false, 'installed command must be an owned thin wrapper, not a Node-selecting symlink');
  assert.match(fs.readFileSync(command, 'utf8'), /^#!\/bin\/sh\n# buildr-development-cli-wrapper\/v1\n/u);
  assert.equal(fs.statSync(command).mode & 0o111, 0o111);
  const identity = JSON.parse(spawnSync(command, [], {
    cwd: PRODUCT_ROOT,
    env: { ...env, BUILDR_INTERNAL_DEVELOPMENT_CLI_IDENTITY_JSON: '1' },
    encoding: 'utf8',
  }).stdout);
  assert.equal(identity.wrapperSchema, 'buildr.development-cli-wrapper/v1');
  assert.equal(fs.realpathSync(identity.launcher), fs.realpathSync(path.join(PRODUCT_ROOT, 'scripts', 'run-development-cli')));
  assert.equal(fs.realpathSync(identity.nodeExecutable), fs.realpathSync(process.execPath), 'polluted PATH must not replace the installed Node binding');

  const firstInode = fs.statSync(command).ino;
  const reinstalled = spawnSync(INSTALLER, ['--node-executable', process.execPath, '--install-dir', installDir], { cwd: PRODUCT_ROOT, env, encoding: 'utf8' });
  assert.equal(reinstalled.status, 0, reinstalled.stderr || reinstalled.stdout);
  assert.notEqual(fs.statSync(command).ino, firstInode, 'repeat install must atomically replace the owned wrapper');

  const uninstalled = spawnSync(UNINSTALLER, [], { cwd: PRODUCT_ROOT, env: { ...env, BUILDR_CLI_INSTALL_DIR: installDir }, encoding: 'utf8' });
  assert.equal(uninstalled.status, 0, uninstalled.stderr || uninstalled.stdout);
  assert.equal(fs.existsSync(command), false);

  fs.symlinkSync(path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs'), command);
  const migrated = spawnSync(INSTALLER, ['--node-executable', process.execPath, '--install-dir', installDir], { cwd: PRODUCT_ROOT, env, encoding: 'utf8' });
  assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
  assert.equal(fs.lstatSync(command).isSymbolicLink(), false, 'legacy managed symlink must migrate to the wrapper');

  const foreignDir = path.join(root, 'foreign');
  fs.mkdirSync(foreignDir);
  const foreignCommand = path.join(foreignDir, 'buildr');
  fs.writeFileSync(foreignCommand, '#!/bin/sh\necho foreign\n', { mode: 0o755 });
  const foreignBefore = fs.readFileSync(foreignCommand, 'utf8');
  const foreignRejected = spawnSync(INSTALLER, ['--node-executable', process.execPath, '--install-dir', foreignDir], { cwd: PRODUCT_ROOT, env, encoding: 'utf8' });
  assert.equal(foreignRejected.status, 1);
  assert.match(foreignRejected.stderr, /Refusing to overwrite existing buildr command/u);
  assert.equal(fs.readFileSync(foreignCommand, 'utf8'), foreignBefore);

  const foreignUninstall = spawnSync(UNINSTALLER, [], { cwd: PRODUCT_ROOT, env: { ...env, BUILDR_CLI_INSTALL_DIR: foreignDir }, encoding: 'utf8' });
  assert.equal(foreignUninstall.status, 1);
  assert.equal(fs.readFileSync(foreignCommand, 'utf8'), foreignBefore);
});
