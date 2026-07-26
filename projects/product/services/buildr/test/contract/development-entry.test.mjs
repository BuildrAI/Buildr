import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
  return spawnSync(entry, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

test('Project bridge 使用 PATH 中首个兼容 Node 启动 Service CLI', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-path-'));
  const oldBin = path.join(fixture, 'old');
  const currentBin = path.join(fixture, 'current');
  fakeNode(path.join(oldBin, 'node'), '18', 'old');
  fakeNode(path.join(currentBin, 'node'), '22', 'current');

  const result = run(projectBridge, ['doctor', '--json'], { PATH: `${oldBin}:${currentBin}` });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^current\|.*bin\/buildr\.mjs doctor --json\n$/u);
});

test('BUILDR_NODE 优先于 PATH 且不兼容 override 会 fail fast', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-override-'));
  const pathNode = path.join(fixture, 'path', 'node');
  const explicitNode = path.join(fixture, 'explicit', 'node');
  fakeNode(pathNode, '22', 'path');
  fakeNode(explicitNode, '24', 'explicit');

  const selected = run(runner, ['--help'], { PATH: path.dirname(pathNode), BUILDR_NODE: explicitNode });
  assert.equal(selected.status, 0, selected.stderr);
  assert.match(selected.stdout, /^explicit\|.*bin\/buildr\.mjs --help\n$/u);

  const incompatibleNode = path.join(fixture, 'incompatible', 'node');
  fakeNode(incompatibleNode, '18', 'incompatible');
  const rejected = run(runner, ['--help'], { PATH: path.dirname(pathNode), BUILDR_NODE: incompatibleNode });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /requires Node\.js >=20; BUILDR_NODE/u);
  assert.equal(rejected.stdout, '');
});

test('开发入口可发现 Agent runtime PATH 相邻的 bundled Node', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-bundled-'));
  const overrideBin = path.join(fixture, 'dependencies/bin/override');
  fs.mkdirSync(overrideBin, { recursive: true });
  fakeNode(path.join(fixture, 'dependencies/node/bin/node'), '24', 'bundled');

  const result = run(runner, ['status'], { PATH: overrideBin });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^bundled\|.*bin\/buildr\.mjs status\n$/u);
});

test('没有兼容 Node 时返回最低版本和恢复动作', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-node-missing-'));
  const oldBin = path.join(fixture, 'old');
  fakeNode(path.join(oldBin, 'node'), '18', 'old');

  const result = run(runner, ['doctor'], { PATH: oldBin });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /requires Node\.js >=20/u);
  assert.match(result.stderr, /Set BUILDR_NODE.*add one to PATH/u);
  assert.doesNotMatch(result.stderr, /SyntaxError/u);
});

test('开发启动器最低版本与 package engines 保持一致', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
  const source = fs.readFileSync(runner, 'utf8');
  assert.equal(packageJson.engines.node, '>=20');
  assert.match(source, /minimum_node_major=20/u);
});
