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
      task: runId, handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 1, contentTargetIdentity: 'sha256-content', agent: 'codex', targetBranch: 'dev', remote: null,
      environmentRoot: root, workspaceRoot: root,
    },
  });
}

test('task finish inspect 只暴露当前固定五阶段', (t) => {
  const root = fixture(t);
  create(root);
  const inspected = spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'current-inspect', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(inspected.status, 0, inspected.stderr);
  const result = JSON.parse(inspected.stdout);
  assert.equal(result.schemaVersion, 'buildr.task-finish-result/v2');
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
    ['run', '--task', 'task', '--project', 'product'],
    ['run', '--task', 'task', '--change', 'change'],
    ['run', '--task', 'task', '--recovery', '{}'],
    ['run', '--task', 'task', '--repair-authorization', '{}'],
  ]) {
    const result = spawnSync(process.execPath, [cli, 'task', 'finish', ...args, '--target', root, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr || result.stdout);
  }
});

test('canonical run 要求 receipt-bound task environment，帮助只列 run 与 inspect', (t) => {
  const root = fixture(t);
  const initialized = spawnSync(process.execPath, [cli, 'init', '--target', root, '--name', 'finish-cli', '--description', 'Task Finish CLI fixture', '--profile', 'team'], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);

  const missingTask = spawnSync(process.execPath, [cli, 'task', 'finish', 'run', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(missingTask.status, 2, missingTask.stderr || missingTask.stdout);
  assert.equal(JSON.parse(missingTask.stdout).error.code, 'task_finish.missing_parameter');

  const created = spawnSync(process.execPath, [cli, 'task', 'create', 'finish-cli-task', '--title', 'Finish CLI Task', '--intent', '验证 Task Environment 门禁', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr || created.stdout);
  const rejected = spawnSync(process.execPath, [cli, 'task', 'finish', 'run', '--task', 'finish-cli-task', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(rejected.status, 2, rejected.stderr || rejected.stdout);
  assert.equal(JSON.parse(rejected.stdout).error.code, 'task_environment_no_receipt');

  const runHelp = spawnSync(process.execPath, [cli, 'help', 'task', 'finish', 'run'], { encoding: 'utf8' });
  const inspectHelp = spawnSync(process.execPath, [cli, 'help', 'task', 'finish', 'inspect'], { encoding: 'utf8' });
  assert.equal(runHelp.status, 0, runHelp.stderr);
  assert.equal(inspectHelp.status, 0, inspectHelp.stderr);
  const helpText = `${runHelp.stdout}\n${inspectHelp.stdout}`;
  assert.match(helpText, /task finish run/);
  assert.match(helpText, /task finish inspect/);
  assert.match(helpText, /--task <task-id> \[--agent <agent>\]/);
  assert.match(helpText, /current formal Development handoff/);
  assert.match(helpText, /retained canonical Workspace 的当前符号分支/);
  assert.match(helpText, /Environment startPoint 不提供交付分支 authority/);
  assert.doesNotMatch(helpText, /Usage:[^\n]*(?:--project|--change)/);
  assert.doesNotMatch(helpText, /target branch 默认来自 Git carrier provider start point/);
  assert.doesNotMatch(helpText, /Usage: buildr task finish (?:advance|recover|cleanup-prepare)\b/);
});

test('OpenSpec 兼容帮助不再把 convergence 路由给 Task Finish', () => {
  for (const topic of [['baseline', 'create'], ['check']]) {
    const result = spawnSync(process.execPath, [cli, 'help', 'openspec', ...topic], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Task Finish 不收敛 Change/);
    assert.doesNotMatch(result.stdout, /新 Task Finish 使用 openspec converge/);
  }
});
