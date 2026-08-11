import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { workspaceNodeRuntimePaths } from '../../src/infrastructure/filesystem/workspace-node-runtime.mjs';

// Integration: every case crosses a real launcher process and temporary filesystem boundary.

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runner = path.join(serviceRoot, 'scripts/run-development-cli');
const projectBridge = path.resolve(serviceRoot, '../../buildr');

function fakeNode(target, version, marker) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `#!/bin/sh
if [ "\${1:-}" = -p ]; then
  echo "${version}"
  exit 0
fi
echo "${marker}|$*"
`, { mode: 0o755 });
}

function run(entry, args, env) {
  const cwd = env.BUILDR_TEST_CWD || os.tmpdir();
  const executionEnv = { ...env };
  delete executionEnv.BUILDR_TEST_CWD;
  return spawnSync(entry, args, {
    encoding: 'utf8',
    cwd,
    env: {
      ...process.env,
      ...executionEnv,
    },
  });
}

test('Project bridge 使用 PATH 中首个兼容 Node 启动 Service CLI', { skip: process.platform === 'win32' }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-path-'));
  const oldBin = path.join(fixture, 'old');
  const currentBin = path.join(fixture, 'current');
  fakeNode(path.join(oldBin, 'node'), '18', 'old');
  fakeNode(path.join(currentBin, 'node'), '24.15.0', 'current');

  const result = run(projectBridge, ['doctor', '--json'], { PATH: `${oldBin}:${currentBin}` });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^current\|.*bin\/buildr\.mjs doctor --json\n$/u);
});

test('已初始化 Workspace 固定使用声明的受管 Node 并忽略 PATH Node', { skip: process.platform === 'win32' }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-workspace-'));
  const workspace = path.join(fixture, 'workspace');
  const appData = path.join(fixture, 'app-data');
  const managed = workspaceNodeRuntimePaths('24.15.0', { dataRoot: appData }).node;
  const pathNode = path.join(fixture, 'path/node');
  fs.mkdirSync(path.join(workspace, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.buildr/workspace.yml'), 'schemaVersion: buildr.workspace/v1\nid: f2f40b71-2382-5906-82bd-76a7927b59f3\nname: Demo\ndescription: Demo\nruntime:\n  node:\n    version: 24.15.0\n');
  fakeNode(managed, '24.15.0', 'managed');
  fakeNode(pathNode, '24.0.0', 'path');
  const result = run(runner, ['--help'], { BUILDR_TEST_CWD: workspace, BUILDR_APP_DATA_DIR: appData, PATH: `${path.dirname(pathNode)}:/usr/bin:/bin` });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^managed\|.*bin\/buildr\.mjs --help\n$/u);
});

test('受管 Node 缺失时仅 doctor/sync 可使用 bootstrap Node', { skip: process.platform === 'win32' }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-recovery-'));
  const workspace = path.join(fixture, 'workspace');
  const bootstrap = path.join(fixture, 'path/node');
  fs.mkdirSync(path.join(workspace, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.buildr/workspace.yml'), 'schemaVersion: buildr.workspace/v1\nid: f2f40b71-2382-5906-82bd-76a7927b59f3\nname: Demo\ndescription: Demo\nruntime:\n  node:\n    version: 24.15.0\n');
  fakeNode(bootstrap, '24.15.0', 'bootstrap');
  const blocked = run(runner, ['project', 'create', 'demo'], { BUILDR_TEST_CWD: workspace, BUILDR_APP_DATA_DIR: path.join(fixture, 'app-data'), PATH: `${path.dirname(bootstrap)}:/usr/bin:/bin` });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /Workspace Node runtime 24\.15\.0 is unavailable.*sync/u);
  const recovery = run(runner, ['doctor', '--json'], { BUILDR_TEST_CWD: workspace, BUILDR_APP_DATA_DIR: path.join(fixture, 'app-data'), PATH: `${path.dirname(bootstrap)}:/usr/bin:/bin` });
  assert.equal(recovery.status, 0, recovery.stderr);
  assert.match(recovery.stdout, /^bootstrap\|.*doctor --json\n$/u);
});

test('BUILDR_NODE 优先于 PATH 且不兼容 override 会 fail fast', { skip: process.platform === 'win32' }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-override-'));
  const pathNode = path.join(fixture, 'path', 'node');
  const explicitNode = path.join(fixture, 'explicit', 'node');
  fakeNode(pathNode, '24.15.0', 'path');
  fakeNode(explicitNode, '24.18.0', 'explicit');

  const selected = run(runner, ['--help'], { PATH: path.dirname(pathNode), BUILDR_NODE: explicitNode });
  assert.equal(selected.status, 0, selected.stderr);
  assert.match(selected.stdout, /^explicit\|.*bin\/buildr\.mjs --help\n$/u);

  const incompatibleNode = path.join(fixture, 'incompatible', 'node');
  fakeNode(incompatibleNode, '18', 'incompatible');
  const rejected = run(runner, ['--help'], { PATH: path.dirname(pathNode), BUILDR_NODE: incompatibleNode });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /requires Node\.js >=24\.15\.0; BUILDR_NODE/u);
  assert.equal(rejected.stdout, '');
});

test('开发入口可发现 Agent runtime PATH 相邻的 bundled Node', { skip: process.platform === 'win32' }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-bundled-'));
  const overrideBin = path.join(fixture, 'dependencies/bin/override');
  fs.mkdirSync(overrideBin, { recursive: true });
  fakeNode(path.join(fixture, 'dependencies/node/bin/node'), '24.15.0', 'bundled');

  const result = run(runner, ['status'], { PATH: overrideBin });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^bundled\|.*bin\/buildr\.mjs status\n$/u);
});

test('没有兼容 Node 时返回最低版本和恢复动作', { skip: process.platform === 'win32' }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-missing-'));
  const oldBin = path.join(fixture, 'old');
  fakeNode(path.join(oldBin, 'node'), '18', 'old');

  const result = run(runner, ['doctor'], { PATH: oldBin });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /requires Node\.js >=24\.15\.0/u);
  assert.match(result.stderr, /Set BUILDR_NODE.*add one to PATH/u);
  assert.doesNotMatch(result.stderr, /SyntaxError/u);
});

test('开发启动器最低版本与 package engines 保持一致', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
  const source = fs.readFileSync(runner, 'utf8');
  assert.equal(packageJson.engines.node, '>=24.15.0');
  assert.match(source, /minimum_node_version=24\.15\.0/u);
});
