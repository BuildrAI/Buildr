import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';

const cli = path.resolve('bin/buildr.mjs');

function fixture(t, initialized = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (initialized) {
    const result = spawnSync(process.execPath, [cli, 'init', '--target', root, '--name', 'finish-cli', '--description', 'Task Finish CLI fixture', '--profile', 'team'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return root;
}

function create(root, runId = 'current-inspect') {
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: runId, title: 'Finish CLI Task', intent: 'Inspect a SQLite Finish run.', projects: [], services: [], changes: [] });
  const run = createFinishRun({
    root,
    runId,
    identity: {
      task: runId, handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 1, contentTargetIdentity: 'sha256-content', agent: 'codex', targetBranch: 'dev', remote: null,
      environmentRoot: root, workspaceRoot: root,
    },
    runtime,
  });
  runtime.writeTaskFinishRunPersistence(root, run);
  return run;
}

test('task finish inspect 只暴露当前固定五阶段', (t) => {
  const root = fixture(t, true);
  create(root);
  const inspected = spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'current-inspect', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(inspected.status, 0, inspected.stderr);
  const result = JSON.parse(inspected.stdout);
  assert.equal(result.schemaVersion, 'buildr.task-finish-result/v2');
  assert.deepEqual(result.resolvedContext.capability, { id: 'buildr.task-finish', version: 1 });
  assert.deepEqual(result.resolvedContext.task, { taskId: 'current-inspect' });
  assert.match(result.resolvedContext.identity, /^sha256-/);
  assert.deepEqual(result.phases.map((phase) => phase.id), ['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
  assert.equal(result.metrics.agentProviderCompletions, 0);
  assert.equal(result.metrics.manualRecoveryManifests, 0);
});

test('当前实现直接使用 canonical store，并拒绝恢复旧 run shape', (t) => {
  const root = fixture(t, true);
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

  const invalidZeroDelta = spawnSync(process.execPath, [cli, 'task', 'finish', 'run', '--task', 'finish-cli-task', '--accept-zero-delta-adaptation', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(invalidZeroDelta.status, 2, invalidZeroDelta.stderr || invalidZeroDelta.stdout);
  assert.equal(JSON.parse(invalidZeroDelta.stdout).error.code, 'task_finish.zero_delta_adaptation_context_invalid');

  const created = spawnSync(process.execPath, [cli, 'task', 'create', 'finish-cli-task', '--title', 'Finish CLI Task', '--intent', '验证 Task Environment 门禁', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr || created.stdout);
  const rejected = spawnSync(process.execPath, [cli, 'task', 'finish', 'run', '--task', 'finish-cli-task', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(rejected.status, 2, rejected.stderr || rejected.stdout);
  const rejectedPayload = JSON.parse(rejected.stdout);
  assert.equal(rejectedPayload.error.code, 'task_finish.entry_gaps');
  assert.ok(rejectedPayload.error.details.gaps.environment.some((item) => item.code === 'task_environment_snapshot_missing'));
  assert.ok(rejectedPayload.error.details.gaps.development.some((item) => item.code === 'task_finish.development_handoff_not_current'));
  assert.equal(rejectedPayload.error.details.nextWorkflow, 'task-development');
  assert.match(rejectedPayload.suggestions.join('\n'), /task-development/);

  const runHelp = spawnSync(process.execPath, [cli, 'help', 'task', 'finish', 'run'], { encoding: 'utf8' });
  const inspectHelp = spawnSync(process.execPath, [cli, 'help', 'task', 'finish', 'inspect'], { encoding: 'utf8' });
  assert.equal(runHelp.status, 0, runHelp.stderr);
  assert.equal(inspectHelp.status, 0, inspectHelp.stderr);
  const helpText = `${runHelp.stdout}\n${inspectHelp.stdout}`;
  assert.match(helpText, /task finish run/);
  assert.match(helpText, /task finish inspect/);
  assert.match(helpText, /--task <task-id> --commit-message <message> \[--agent <agent>\]/);
  assert.match(helpText, /已有run\/resume不接受--commit-message覆盖/);
  assert.match(helpText, /--accept-zero-delta-adaptation/);
  assert.match(helpText, /不创建commit、不替代resume token/);
  assert.match(helpText, /Buildr-Task trailer/);
  assert.match(helpText, /current formal Development handoff/);
  assert.match(helpText, /retained canonical Workspace 的当前符号分支/);
  assert.match(helpText, /Environment startPoint 不提供交付分支 authority/);
  assert.doesNotMatch(helpText, /Usage:[^\n]*(?:--project|--change)/);
  assert.doesNotMatch(helpText, /target branch 默认来自 Git carrier provider start point/);
  assert.doesNotMatch(helpText, /Usage: buildr task finish (?:advance|recover|cleanup-prepare)\b/);
});

test('已清退的 OpenSpec Legacy 帮助入口不再存在', () => {
  for (const topic of [['baseline', 'create'], ['check']]) {
    const result = spawnSync(process.execPath, [cli, 'help', 'openspec', ...topic], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /Unknown help topic/);
  }
});
