import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import {
  ensureSharedRuntimeNode,
  resolveHostNodeExecutable,
  sharedRuntimeNodeLaunchEnv,
  sharedRuntimeNodePath,
  sharedRuntimeNodeRoot,
} from '../../src/infrastructure/shared-runtime-node.ts';

test('resolveHostNodeExecutable 仅在路径存在且版本一致时采纳 BUILDR_HOST_NODE', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-host-node-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fakeHostNode = path.join(dir, 'node');
  fs.writeFileSync(fakeHostNode, 'host-node');

  assert.equal(resolveHostNodeExecutable({}), process.execPath);
  assert.equal(resolveHostNodeExecutable({ BUILDR_HOST_NODE: 'relative/node' }), process.execPath);
  assert.equal(resolveHostNodeExecutable({ BUILDR_HOST_NODE: path.join(dir, 'missing-node') }), process.execPath);
  assert.equal(
    resolveHostNodeExecutable({ BUILDR_HOST_NODE: fakeHostNode, BUILDR_HOST_NODE_VERSION: '99.99.99' }),
    process.execPath,
  );
  assert.equal(
    resolveHostNodeExecutable({ BUILDR_HOST_NODE: fakeHostNode, BUILDR_HOST_NODE_VERSION: process.versions.node }),
    path.resolve(fakeHostNode),
  );
  assert.equal(resolveHostNodeExecutable({ BUILDR_HOST_NODE: fakeHostNode }), path.resolve(fakeHostNode));
});

test('sharedRuntimeNodeRoot 在测试隔离环境忽略 BUILDR_HOST_HOME，在真实环境按宿主目录统一解析', () => {
  assert.equal(
    sharedRuntimeNodeRoot({
      env: { BUILDR_SHARED_NODE_ROOT: '/custom/shared/runtime', BUILDR_HOST_HOME: '/Users/real-host', NODE_TEST_CONTEXT: '1' },
      platform: 'darwin',
      fallbackDataRoot: '/tmp/test-data',
    }),
    path.resolve('/custom/shared/runtime'),
  );
  assert.equal(
    sharedRuntimeNodeRoot({
      env: { BUILDR_HOST_HOME: '/Users/real-host', NODE_TEST_CONTEXT: '1', HOME: '/tmp/test-home' },
      platform: 'darwin',
      fallbackDataRoot: '/tmp/test-data',
    }),
    path.resolve('/tmp/test-data', 'runtime'),
  );
  assert.equal(
    sharedRuntimeNodeRoot({
      env: { BUILDR_HOST_HOME: '/Users/real-host', BUILDR_TEST_STATE_REQUIRED: '1', HOME: '/tmp/test-home' },
      platform: 'darwin',
    }),
    path.join('/tmp/test-home', 'Library', 'Application Support', 'Buildr', 'runtime'),
  );
  assert.equal(
    sharedRuntimeNodeRoot({
      env: { BUILDR_HOST_HOME: '/Users/real-host', HOME: '/tmp/isolated-agent-home' },
      platform: 'darwin',
      fallbackDataRoot: '/Users/real-host/Library/Application Support/Buildr Dev',
    }),
    '/Users/real-host/Library/Application Support/Buildr/runtime',
  );
  assert.equal(
    sharedRuntimeNodePath({
      env: { BUILDR_HOST_HOME: 'C:\\Users\\real-host', LOCALAPPDATA: 'C:\\Users\\real-host\\AppData\\Local' },
      platform: 'win32',
    }),
    'C:\\Users\\real-host\\AppData\\Local\\Buildr\\runtime\\node.exe',
  );
  assert.equal(
    sharedRuntimeNodePath({
      env: { BUILDR_HOST_HOME: '/home/real-host', XDG_STATE_HOME: '/home/real-host/.local/state' },
      platform: 'linux',
    }),
    '/home/real-host/.local/state/buildr/runtime/node',
  );
});

test('ensureSharedRuntimeNode 原子物化、同路径升级、防篡改 fail closed 并保留宿主 Node 环境', { skip: process.platform === 'win32' }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-shared-node-unit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sharedRoot = path.join(dir, 'shared-runtime');
  const nodeV1 = path.join(dir, 'node-v1');
  const nodeV2 = path.join(dir, 'node-v2');
  fs.writeFileSync(nodeV1, 'node-binary-v1');
  fs.chmodSync(nodeV1, 0o755);
  fs.writeFileSync(nodeV2, 'node-binary-v2');
  fs.chmodSync(nodeV2, 0o755);

  const env: NodeJS.ProcessEnv = { BUILDR_SHARED_NODE_ROOT: sharedRoot };
  const first = ensureSharedRuntimeNode(nodeV1, { env, hostNode: nodeV1 });
  assert.equal(first.executable, path.join(sharedRoot, 'node'));
  assert.equal(first.hostNode, path.resolve(nodeV1));
  const stat1 = fs.lstatSync(first.executable);
  assert.equal(stat1.nlink, 1);
  assert.equal(stat1.mode & 0o222, 0);
  assert.notEqual(stat1.mode & 0o100, 0);
  assert.equal(fs.readFileSync(first.executable, 'utf8'), 'node-binary-v1');

  // Reusing identical bytes keeps the exact inode without rewriting.
  const reused = ensureSharedRuntimeNode(nodeV1, { env, hostNode: nodeV1 });
  assert.equal(fs.lstatSync(reused.executable).ino, stat1.ino);

  // Upgrading Node replaces the exact same path atomically.
  const upgraded = ensureSharedRuntimeNode(nodeV2, { env, hostNode: nodeV2 });
  assert.equal(upgraded.executable, first.executable);
  assert.equal(fs.readFileSync(upgraded.executable, 'utf8'), 'node-binary-v2');
  assert.notEqual(fs.lstatSync(upgraded.executable).ino, stat1.ino);
  assert.equal(fs.lstatSync(upgraded.executable).nlink, 1);

  // Tamper checks fail closed.
  fs.chmodSync(upgraded.executable, 0o700);
  assert.throws(() => ensureSharedRuntimeNode(nodeV2, { env }), { code: 'shared_runtime_node_unsafe' });
  fs.writeFileSync(upgraded.executable, 'tampered');
  fs.chmodSync(upgraded.executable, 0o500);
  assert.throws(() => ensureSharedRuntimeNode(nodeV2, { env }), { code: 'shared_runtime_node_unsafe' });

  const launchEnv = sharedRuntimeNodeLaunchEnv({ PATH: '/usr/bin:/bin' }, nodeV2, '24.21.0');
  assert.equal(launchEnv.BUILDR_HOST_NODE, path.resolve(nodeV2));
  assert.equal(launchEnv.BUILDR_HOST_NODE_VERSION, '24.21.0');
  assert.equal(launchEnv.PATH, `${path.dirname(path.resolve(nodeV2))}${path.delimiter}/usr/bin:/bin`);
});
