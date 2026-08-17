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

test('task finish inspect 默认compact、显式full且文本保持稳定', (t) => {
  const root = fixture(t, true);
  create(root);
  const inspect = (...args) => spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'current-inspect', '--target', root, ...args], { encoding: 'utf8' });
  const implicit = inspect('--json');
  const explicit = inspect('--json', '--detail', 'compact');
  const full = inspect('--json', '--detail', 'full');
  const text = inspect();
  for (const result of [implicit, explicit, full, text]) assert.equal(result.status, 0, result.stderr);

  const compact = JSON.parse(implicit.stdout);
  const explicitCompact = JSON.parse(explicit.stdout);
  assert.deepEqual({ ...compact, metrics: { ...compact.metrics, wallClockMs: 0 } }, { ...explicitCompact, metrics: { ...explicitCompact.metrics, wallClockMs: 0 } });
  assert.equal(compact.schemaVersion, 'buildr.task-finish-compact-result/v1');
  assert.equal(compact.detail, 'compact');
  assert.equal(compact.identity.taskId, 'current-inspect');
  assert.deepEqual(compact.phases.map((phase) => phase.id), ['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
  for (const forbidden of ['resolvedContext', 'carrier', 'equivalence', 'checks', 'operations', 'observations']) assert.equal(forbidden in compact, false, forbidden);

  const fullResult = JSON.parse(full.stdout);
  assert.equal(fullResult.schemaVersion, 'buildr.task-finish-result/v2');
  assert.deepEqual(fullResult.resolvedContext.capability, { id: 'buildr.task-finish', version: 1 });
  assert.equal(fullResult.metrics.agentProviderCompletions, 0);
  assert.equal(fullResult.metrics.manualRecoveryManifests, 0);
  assert.notEqual(implicit.stdout, full.stdout);
  assert.ok(implicit.stdout.length < full.stdout.length);
  assert.equal(text.stdout, 'Task Finish run current-inspect: active\nNext: none\n');
});

test('task finish 非法detail在读取run前失败', (t) => {
  const root = fixture(t, true);
  const result = spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'missing', '--target', root, '--json', '--detail', 'verbose'], { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 'buildr.cli-error/v1');
  assert.equal(payload.error.code, 'task_finish.detail_invalid');
  assert.match(payload.help, /task finish inspect/);
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
  assert.match(helpText, /--release-occupancy/);
  assert.match(helpText, /占用释放/);
  assert.match(helpText, /不创建commit、不替代resume token/);
  assert.match(helpText, /Buildr-Task trailer/);
  assert.match(helpText, /current formal Development handoff/);
  assert.match(helpText, /retained canonical Workspace 的当前符号分支/);
  assert.match(helpText, /省略时使用 Task Environment 已绑定 adapter/);
  assert.match(helpText, /不得猜测当前聊天宿主或默认为 Codex/);
  assert.match(helpText, /deliver使用Environment adapter冻结的run agent/);
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
