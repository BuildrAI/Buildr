import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ensureWorkspaceNodeRuntime,
  acquireRuntimeInstallLock,
  normalizeNodePlatform,
  probeWorkspaceNodeRuntime,
  releaseRuntimeInstallLock,
  runRuntimeFilesystemOperation,
  runtimeTreeRemovalOptions,
  workspaceNodeIdentity,
  workspaceNodeRuntimePaths,
} from '../../src/infrastructure/filesystem/workspace-node-runtime.mjs';

const WORKSPACE = {
  id: 'f2f40b71-2382-5906-82bd-76a7927b59f3',
  runtime: { node: { version: '22.4.1' } },
};

function fixtureRuntime(root) {
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bin/node'), '#!/bin/sh\nif [ "$1" = "-p" ]; then echo 22.4.1; else echo v22.4.1; fi\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'bin/npm'), '#!/bin/sh\necho 10.8.0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'bin/npx'), '#!/bin/sh\necho 10.8.0\n', { mode: 0o755 });
}

function fixtureWindowsRuntime(root) {
  fs.mkdirSync(path.join(root, 'node_modules/npm/bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node.exe'), '#!/bin/sh\nif [ "$1" = "-p" ]; then echo 22.4.1; else echo 10.8.0; fi\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'npm.cmd'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'node_modules/npm/bin/npm-cli.js'), '// fixture\n');
}

test('Workspace Node identity 不包含机器路径且按 platform/arch 稳定', () => {
  const identity = workspaceNodeIdentity(WORKSPACE, { platform: 'darwin', arch: 'arm64' });
  assert.equal(identity.version, '22.4.1');
  assert.equal(identity.platform, 'darwin');
  assert.match(identity.digest, /^sha256-[0-9a-f]{64}$/);
  assert.equal('executable' in identity, false);
  assert.deepEqual(normalizeNodePlatform('linux', 'x64'), { platform: 'linux', arch: 'x64', key: 'linux-x64' });
  assert.throws(() => normalizeNodePlatform('freebsd', 'x64'), /Unsupported/);
});

test('Workspace Node runtime 临时目录在 Windows 使用 bounded EPERM retry', () => {
  assert.deepEqual(runtimeTreeRemovalOptions('win32'), {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
  assert.deepEqual(runtimeTreeRemovalOptions('win'), runtimeTreeRemovalOptions('win32'));
  assert.deepEqual(runtimeTreeRemovalOptions('darwin'), { recursive: true, force: true });
});

test('Windows runtime 文件操作会恢复瞬时 EPERM，并在耗尽后保留操作诊断', () => {
  let attempts = 0;
  const waits = [];
  const result = runRuntimeFilesystemOperation('copy-source-to-stage', 'C:\\runtime.tmp', () => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error('temporarily locked'), { code: 'EPERM' });
    return 'copied';
  }, {
    platform: 'win32',
    filesystemRetryWait: (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(result, 'copied');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [100, 100]);

  let now = 0;
  assert.throws(
    () => runRuntimeFilesystemOperation('cleanup-stage', 'C:\\runtime.tmp', () => {
      throw Object.assign(new Error('still locked'), { code: 'EBUSY' });
    }, {
      platform: 'win32',
      filesystemRetryTimeoutMs: 150,
      filesystemRetryNow: () => now,
      filesystemRetryWait: (milliseconds) => { now += milliseconds; },
    }),
    (error) => error.code === 'EBUSY'
      && error.operation === 'cleanup-stage'
      && error.target === 'C:\\runtime.tmp'
      && /cleanup-stage failed/.test(error.message),
  );
});

test('runtime install lock 等待活跃 owner，并回收已退出 owner 的遗留锁', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-runtime-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataRoot = path.join(root, 'data');
  const source = path.join(root, 'source');
  fixtureRuntime(source);
  const options = { dataRoot, platform: 'darwin', arch: 'arm64', sourceRoot: source };
  const paths = workspaceNodeRuntimePaths(WORKSPACE.runtime.node.version, options);
  fs.mkdirSync(path.dirname(paths.root), { recursive: true });
  const lockFile = `${paths.root}.lock`;

  const active = {
    schemaVersion: 'buildr.workspace-node-runtime-install-lock/v1',
    pid: 4242,
    token: 'active-owner',
    createdAt: '2026-08-12T00:00:00.000Z',
  };
  fs.writeFileSync(lockFile, `${JSON.stringify(active)}\n`);
  let waits = 0;
  const reused = acquireRuntimeInstallLock(lockFile, WORKSPACE, {
    ...options,
    runtimeInstallOwnerAlive: () => true,
    runtimeInstallLockWait() {
      waits += 1;
      fixtureRuntime(paths.root);
    },
  });
  assert.equal(reused.owner, false);
  assert.equal(reused.winner.status, 'ready');
  assert.equal(waits, 1);
  fs.rmSync(lockFile, { force: true });
  fs.rmSync(paths.root, { recursive: true, force: true });

  const stale = { ...active, pid: 4343, token: 'stale-owner' };
  fs.writeFileSync(lockFile, `${JSON.stringify(stale)}\n`);
  const acquired = acquireRuntimeInstallLock(lockFile, WORKSPACE, {
    ...options,
    runtimeInstallOwnerAlive: () => false,
  });
  assert.equal(acquired.owner, true);
  assert.notEqual(acquired.record.token, stale.token);
  assert.equal(releaseRuntimeInstallLock(acquired, options), true);
  assert.equal(fs.existsSync(lockFile), false);
});

test('runtime install lock 只允许当前 token 释放，等待耗尽保留 owner 诊断', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-runtime-lock-token-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lockFile = path.join(root, 'runtime.lock');
  const workspace = { ...WORKSPACE, runtime: { node: { version: '99.0.0' } } };
  const owner = acquireRuntimeInstallLock(lockFile, workspace, { platform: 'darwin', dataRoot: root });
  const replacement = { ...owner.record, token: 'replacement-owner' };
  fs.writeFileSync(lockFile, `${JSON.stringify(replacement)}\n`);
  assert.equal(releaseRuntimeInstallLock(owner, { platform: 'darwin' }), false);
  assert.equal(fs.existsSync(lockFile), true);

  let now = 0;
  assert.throws(
    () => acquireRuntimeInstallLock(lockFile, workspace, {
      platform: 'darwin',
      dataRoot: root,
      lockTimeoutMs: 100,
      runtimeInstallOwnerAlive: () => true,
      runtimeInstallLockNow: () => now,
      runtimeInstallLockWait: (milliseconds) => { now += milliseconds; },
    }),
    (error) => error.code === 'workspace_node_runtime_install_locked'
      && error.operation === 'wait-for-lock'
      && /pid=/.test(error.message),
  );
});

test('临时 App Data 只隔离应用状态，不改变 Workspace Node runtime locator', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-runtime-data-boundary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  const previousRuntimeData = process.env.BUILDR_NODE_RUNTIME_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(root, 'app-state');
  delete process.env.BUILDR_NODE_RUNTIME_DATA_DIR;
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
    if (previousRuntimeData === undefined) delete process.env.BUILDR_NODE_RUNTIME_DATA_DIR;
    else process.env.BUILDR_NODE_RUNTIME_DATA_DIR = previousRuntimeData;
  });
  const defaultRuntime = workspaceNodeRuntimePaths('22.4.1');
  assert.equal(defaultRuntime.dataRoot.includes(path.join(root, 'app-state')), false);
  process.env.BUILDR_NODE_RUNTIME_DATA_DIR = path.join(root, 'runtime-state');
  assert.equal(workspaceNodeRuntimePaths('22.4.1').dataRoot, path.join(root, 'runtime-state'));
});

test('受管 runtime 从确定 source 原子准备、复用并在删除后按原版本恢复', { skip: process.platform === 'win32' }, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const dataRoot = path.join(root, 'data');
  fixtureRuntime(source);
  const options = { dataRoot, platform: 'darwin', arch: 'arm64', sourceRoot: source };
  assert.equal(probeWorkspaceNodeRuntime(WORKSPACE, options).status, 'missing');
  const installed = ensureWorkspaceNodeRuntime(WORKSPACE, options);
  assert.equal(installed.status, 'ready');
  assert.equal(installed.action, 'installed');
  assert.equal(ensureWorkspaceNodeRuntime(WORKSPACE, options).action, 'reused');
  const paths = workspaceNodeRuntimePaths('22.4.1', options);
  fs.rmSync(paths.root, { recursive: true, force: true });
  const restored = ensureWorkspaceNodeRuntime(WORKSPACE, options);
  assert.equal(restored.identity.version, '22.4.1');
  assert.equal(restored.status, 'ready');
});

test('Windows 受管 runtime 直接通过 node.exe 执行 npm CLI，并恢复 source copy 的瞬时 EPERM', { skip: process.platform === 'win32' }, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-runtime-windows-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(source, { recursive: true });
  fixtureWindowsRuntime(source);
  let copyAttempts = 0;
  const options = {
    dataRoot,
    platform: 'win32',
    arch: 'x64',
    sourceRoot: source,
    filesystemRetryWait: () => {},
    copyRuntimeTree(from, to, copyOptions) {
      copyAttempts += 1;
      if (copyAttempts < 3) throw Object.assign(new Error('scanner lock'), { code: 'EPERM' });
      fs.cpSync(from, to, copyOptions);
    },
  };
  const installed = ensureWorkspaceNodeRuntime(WORKSPACE, options);
  assert.equal(installed.status, 'ready');
  assert.equal(copyAttempts, 3);
  assert.equal(probeWorkspaceNodeRuntime(WORKSPACE, options).npmVersion, '10.8.0');
});

test('离线验证拒绝回退到公网下载 Workspace Node', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-runtime-offline-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(
    () => ensureWorkspaceNodeRuntime(WORKSPACE, {
      dataRoot: path.join(root, 'data'),
      platform: 'darwin',
      arch: 'arm64',
      env: { BUILDR_VERIFICATION_NETWORK_MODE: 'offline' },
    }),
    /Workspace Node download is disabled during offline verification/,
  );
});
