import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';

const cli = path.resolve('bin/buildr.mjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function create(root, runId = 'current-inspect') {
  return createFinishRun({
    root,
    runId,
    identity: {
      task: runId, change: 'finish-current', project: 'product', agent: 'codex', targetBranch: 'dev', remote: null,
      environmentRoot: root, workspaceRoot: root, requiredAssurance: 'affected',
    },
  });
}

test('task finish inspect 只暴露当前固定五阶段', (t) => {
  const root = fixture(t);
  create(root);
  const inspected = spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'current-inspect', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(inspected.status, 0, inspected.stderr);
  const result = JSON.parse(inspected.stdout);
  assert.equal(result.schemaVersion, 'buildr.task-finish-result/v1');
  assert.deepEqual(result.phases.map((phase) => phase.id), ['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
  assert.equal(result.metrics.agentProviderCompletions, 0);
  assert.equal(result.metrics.manualRecoveryManifests, 0);
});

test('当前实现直接使用 canonical store，并拒绝恢复旧 run shape', (t) => {
  const root = fixture(t);
  create(root, 'migration');
  const oldRoot = path.join(root, '.buildr', 'task-finish');
  fs.mkdirSync(path.join(oldRoot, 'runs'), { recursive: true });
  fs.mkdirSync(path.join(oldRoot, 'completed'), { recursive: true });
  fs.writeFileSync(path.join(oldRoot, 'runs', 'old.json'), '{"schemaVersion":"buildr.task-finish-run/v1"}\n');
  fs.writeFileSync(path.join(oldRoot, 'completed', 'old.json'), '{"schemaVersion":"buildr.task-finish-completion/v1"}\n');
  const inspected = spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'migration', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(inspected.status, 0, inspected.stderr);
  const rejected = spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'old', '--target', root, '--json'], { encoding: 'utf8' });
  assert.notEqual(rejected.status, 0, rejected.stderr || rejected.stdout);
  assert.equal(fs.readFileSync(path.join(oldRoot, 'runs', 'old.json'), 'utf8'), '{"schemaVersion":"buildr.task-finish-run/v1"}\n');
  assert.equal(fs.readFileSync(path.join(oldRoot, 'completed', 'old.json'), 'utf8'), '{"schemaVersion":"buildr.task-finish-completion/v1"}\n');
  assert.equal(fs.existsSync(path.join(oldRoot, 'migrations')), false);
});

test('当前客户端拒绝旧 action 与 caller-authored 协议参数', (t) => {
  const root = fixture(t);
  for (const args of [
    ['advance', '--run', 'old'],
    ['run', '--change', 'change', '--project', 'product', '--fingerprint', 'prepare=caller-proof'],
    ['run', '--change', 'change', '--project', 'product', '--recovery', '{}'],
    ['run', '--change', 'change', '--project', 'product', '--repair-authorization', '{}'],
  ]) {
    const result = spawnSync(process.execPath, [cli, 'task', 'finish', ...args, '--target', root, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr || result.stdout);
  }
});

test('canonical run 要求 receipt-bound task environment，帮助只列 run 与 inspect', (t) => {
  const root = fixture(t);
  const rejected = spawnSync(process.execPath, [cli, 'task', 'finish', 'run', '--change', 'finish-current', '--project', 'product', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(rejected.status, 2, rejected.stderr || rejected.stdout);
  assert.equal(JSON.parse(rejected.stdout).error.code, 'task_finish.not_task_environment');

  const runHelp = spawnSync(process.execPath, [cli, 'help', 'task', 'finish', 'run'], { encoding: 'utf8' });
  const inspectHelp = spawnSync(process.execPath, [cli, 'help', 'task', 'finish', 'inspect'], { encoding: 'utf8' });
  assert.equal(runHelp.status, 0, runHelp.stderr);
  assert.equal(inspectHelp.status, 0, inspectHelp.stderr);
  const helpText = `${runHelp.stdout}\n${inspectHelp.stdout}`;
  assert.match(helpText, /task finish run/);
  assert.match(helpText, /task finish inspect/);
  assert.doesNotMatch(helpText, /Usage: buildr task finish (?:advance|recover|cleanup-prepare)\b/);
});
