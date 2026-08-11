import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ensureWorkspaceNodeRuntime,
  normalizeNodePlatform,
  probeWorkspaceNodeRuntime,
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
  fs.writeFileSync(path.join(root, 'node.exe'), '#!/bin/sh\nif [ "$1" = "-p" ]; then echo 22.4.1; else echo v22.4.1; fi\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'npm.cmd'), '#!/bin/sh\necho 10.8.0\n', { mode: 0o755 });
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
  assert.deepEqual(runtimeTreeRemovalOptions('darwin'), { recursive: true, force: true });
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

test('Windows 受管 runtime 通过 npm.cmd 探测', { skip: process.platform === 'win32' }, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-runtime-windows-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(source, { recursive: true });
  fixtureWindowsRuntime(source);
  const options = { dataRoot, platform: 'win32', arch: 'x64', sourceRoot: source };
  const installed = ensureWorkspaceNodeRuntime(WORKSPACE, options);
  assert.equal(installed.status, 'ready');
  assert.equal(probeWorkspaceNodeRuntime(WORKSPACE, options).npmVersion, '10.8.0');
});
