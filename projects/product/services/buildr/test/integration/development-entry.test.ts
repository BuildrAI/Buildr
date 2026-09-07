import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Integration: every case crosses a real launcher process and temporary filesystem boundary.

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runner: any = path.join(serviceRoot, 'tools/development/run-development-cli');
const projectBridge: any = path.resolve(serviceRoot, '../../buildr');

function fakeNode(target: any, version: any, marker: any): any  {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `#!/bin/sh
if [ "\${1:-}" = -p ]; then
  echo "${version}"
  exit 0
fi
echo "${marker}|$*"
`, { mode: 0o755 });
}

function run(entry: any, args: any, env: any): any  {
  const cwd: any = env.BUILDR_TEST_CWD || os.tmpdir();
  const executionEnv: any = { ...env };
  const inheritedEnv: any = { ...process.env };
  delete executionEnv.BUILDR_TEST_CWD;
  delete inheritedEnv.BUILDR_NODE;
  delete inheritedEnv.NVM_DIR;
  return spawnSync(entry, args, {
    encoding: 'utf8',
    cwd,
    env: {
      ...inheritedEnv,
      ...executionEnv,
    },
  });
}

test('Project bridge 只使用 PATH 中与 Product .node-version 完全一致的 Node', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-path-'));
  const oldBin: any = path.join(fixture, 'old');
  const currentBin: any = path.join(fixture, 'current');
  fakeNode(path.join(oldBin, 'node'), '18', 'old');
  fakeNode(path.join(currentBin, 'node'), '24.15.0', 'current');

  const result: any = run(projectBridge, ['doctor', '--json'], { PATH: `${oldBin}:${currentBin}` });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^current\|.*bin\/buildr\.mjs doctor --json\n$/u);
});

test('hostile PATH 下优先使用显式 NVM_DIR 中的 Product 精确 Node', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-nvm-'));
  const hostileBin: any = path.join(fixture, 'hostile');
  const nvmRoot: any = path.join(fixture, 'nvm');
  fakeNode(path.join(hostileBin, 'node'), '24.19.0', 'hostile');
  fakeNode(path.join(nvmRoot, 'versions/node/v24.15.0/bin/node'), '24.15.0', 'nvm-exact');

  const result: any = run(projectBridge, ['doctor', '--json'], { NVM_DIR: nvmRoot, PATH: hostileBin });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^nvm-exact\|.*bin\/buildr\.mjs doctor --json\n$/u);
  assert.doesNotMatch(result.stdout, /hostile/u);
});

test('不匹配的显式 NVM_DIR 候选不会覆盖 PATH 中的精确 Node', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-nvm-mismatch-'));
  const exactBin: any = path.join(fixture, 'exact');
  const nvmRoot: any = path.join(fixture, 'nvm');
  fakeNode(path.join(exactBin, 'node'), '24.15.0', 'path-exact');
  fakeNode(path.join(nvmRoot, 'versions/node/v24.15.0/bin/node'), '24.19.0', 'nvm-wrong');

  const result: any = run(projectBridge, ['doctor'], { NVM_DIR: nvmRoot, PATH: exactBin });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^path-exact\|.*bin\/buildr\.mjs doctor\n$/u);
});

test('Workspace legacy runtime.node 不影响 development main process 的 Product Node', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-workspace-'));
  const workspace: any = path.join(fixture, 'workspace');
  const pathNode: any = path.join(fixture, 'path/node');
  fs.mkdirSync(path.join(workspace, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.buildr/workspace.yml'), 'schemaVersion: buildr.workspace/v1\nid: f2f40b71-2382-5906-82bd-76a7927b59f3\nname: Demo\ndescription: Demo\nruntime:\n  node:\n    version: 24.15.0\n');
  fakeNode(pathNode, '24.15.0', 'development-host');
  const result: any = run(runner, ['--help'], { BUILDR_TEST_CWD: workspace, BUILDR_APP_DATA_DIR: path.join(fixture, 'app-data'), PATH: `${path.dirname(pathNode)}:/usr/bin:/bin` });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^development-host\|.*bin\/buildr\.mjs --help\n$/u);
});

test('runner-only identity inspection返回launcher、CLI entry和实际Node', { skip: process.platform === 'win32' }, () => {
  const exactNode: any = process.env.BUILDR_NODE || process.execPath;
  const result: any = run(runner, [], {
    PATH: path.dirname(exactNode),
    BUILDR_NODE: exactNode,
    BUILDR_INTERNAL_DEVELOPMENT_CLI_IDENTITY_JSON: '1',
  });
  assert.equal(result.status, 0, result.stderr);
  const identity: any = JSON.parse(result.stdout);
  assert.equal(identity.schemaVersion, 'buildr.development-cli-identity/v1');
  assert.equal(identity.launcher, runner);
  assert.equal(identity.cliEntry, path.join(serviceRoot, 'bin', 'buildr.mjs'));
  assert.equal(fs.realpathSync(identity.nodeExecutable), fs.realpathSync(exactNode));
});

test('Workspace 未声明 runtime.node 不会阻断 development main process', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-recovery-'));
  const workspace: any = path.join(fixture, 'workspace');
  const bootstrap: any = path.join(fixture, 'path/node');
  fs.mkdirSync(path.join(workspace, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.buildr/workspace.yml'), 'schemaVersion: buildr.workspace/v1\nid: f2f40b71-2382-5906-82bd-76a7927b59f3\nname: Demo\ndescription: Demo\n');
  fakeNode(bootstrap, '24.15.0', 'bootstrap');
  const main: any = run(runner, ['project', 'create', 'demo'], { BUILDR_TEST_CWD: workspace, BUILDR_APP_DATA_DIR: path.join(fixture, 'app-data'), PATH: `${path.dirname(bootstrap)}:/usr/bin:/bin` });
  assert.equal(main.status, 0, main.stderr);
  assert.match(main.stdout, /^bootstrap\|.*bin\/buildr\.mjs project create demo\n$/u);
});

test('BUILDR_NODE 优先于 PATH 且非精确版本 override 会 fail fast', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-override-'));
  const pathNode: any = path.join(fixture, 'path', 'node');
  const explicitNode: any = path.join(fixture, 'explicit', 'node');
  fakeNode(pathNode, '24.15.0', 'path');
  fakeNode(explicitNode, '24.15.0', 'explicit');

  const selected: any = run(runner, ['--help'], { PATH: path.dirname(pathNode), BUILDR_NODE: explicitNode });
  assert.equal(selected.status, 0, selected.stderr);
  assert.match(selected.stdout, /^explicit\|.*bin\/buildr\.mjs --help\n$/u);

  const incompatibleNode: any = path.join(fixture, 'incompatible', 'node');
  fakeNode(incompatibleNode, '18', 'incompatible');
  const rejected: any = run(runner, ['--help'], { PATH: path.dirname(pathNode), BUILDR_NODE: incompatibleNode });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /requires exact Node\.js 24\.15\.0; BUILDR_NODE/u);
  assert.equal(rejected.stdout, '');

  const futureNode: any = path.join(fixture, 'future', 'node');
  fakeNode(futureNode, '25.0.0', 'future');
  const futureRejected: any = run(runner, ['--help'], { PATH: path.dirname(pathNode), BUILDR_NODE: futureNode });
  assert.equal(futureRejected.status, 1);
  assert.match(futureRejected.stderr, /requires exact Node\.js 24\.15\.0; BUILDR_NODE/u);
  assert.equal(futureRejected.stdout, '');
});

test('开发入口可发现 Agent runtime PATH 相邻的 bundled Node', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-bundled-'));
  const overrideBin: any = path.join(fixture, 'dependencies/bin/override');
  fs.mkdirSync(overrideBin, { recursive: true });
  fakeNode(path.join(fixture, 'dependencies/node/bin/node'), '24.15.0', 'bundled');

  const result: any = run(runner, ['status'], { PATH: overrideBin });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^bundled\|.*bin\/buildr\.mjs status\n$/u);
});

test('没有精确 Product Node 时返回锁定版本和恢复动作', { skip: process.platform === 'win32' }, () => {
  const fixture: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-missing-'));
  const oldBin: any = path.join(fixture, 'old');
  fakeNode(path.join(oldBin, 'node'), '18', 'old');

  const result: any = run(runner, ['doctor'], { PATH: oldBin });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /requires exact Node\.js 24\.15\.0/u);
  assert.match(result.stderr, /Set BUILDR_NODE.*activate the Product \.node-version/u);
  assert.doesNotMatch(result.stderr, /SyntaxError/u);
});

test('开发启动器读取 Product 精确版本且 package engines 保留发布兼容范围', () => {
  const packageJson: any = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
  const source: any = fs.readFileSync(runner, 'utf8');
  assert.equal(fs.readFileSync(path.resolve(serviceRoot, '../..', '.node-version'), 'utf8').trim(), '24.15.0');
  assert.equal(packageJson.engines.node, '>=24.15.0 <25');
  assert.match(source, /resolve-development-node/u);
  assert.doesNotMatch(source, /workspace\.yml|Workspace Node runtime|BUILDR_NODE_RUNTIME_DATA_DIR/u);
});
