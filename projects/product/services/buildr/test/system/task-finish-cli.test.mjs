import { legacyFinishRuntime } from '../helpers/legacy-finish-history.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createFinishRun } from '../helpers/legacy-finish-history.mjs';

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
  const runtime = legacyFinishRuntime(createRuntime());
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

test('task finish inspect 默认compact、显式full/self-bootstrap且文本保持稳定', (t) => {
  const root = fixture(t, true);
  create(root);
  const inspect = (...args) => spawnSync(process.execPath, [cli, 'task', 'finish', 'inspect', '--run', 'current-inspect', '--target', root, ...args], { encoding: 'utf8' });
  const implicit = inspect('--json');
  const explicit = inspect('--json', '--detail', 'compact');
  const full = inspect('--json', '--detail', 'full');
  const selfBootstrap = inspect('--json', '--detail', 'self-bootstrap');
  const text = inspect();
  for (const result of [implicit, explicit, full, selfBootstrap, text]) assert.equal(result.status, 0, result.stderr);

  const compact = JSON.parse(implicit.stdout);
  const explicitCompact = JSON.parse(explicit.stdout);
  assert.deepEqual({ ...compact, metrics: { ...compact.metrics, wallClockMs: 0 } }, { ...explicitCompact, metrics: { ...explicitCompact.metrics, wallClockMs: 0 } });
  assert.equal(compact.schemaVersion, 'buildr.task-finish-compact-result/v1');
  assert.equal(compact.detail, 'compact');
  assert.equal(compact.identity.taskId, 'current-inspect');
  assert.deepEqual(compact.phases.map((phase) => phase.id), ['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
  for (const forbidden of ['resolvedContext', 'carrier', 'equivalence', 'checks', 'operations', 'observations']) assert.equal(forbidden in compact, false, forbidden);

  const fullResult = JSON.parse(full.stdout);
  assert.equal(fullResult.schemaVersion, 'buildr.task-finish-result/v3');
  assert.deepEqual(fullResult.resolvedContext.capability, { id: 'buildr.task-finish', version: 1 });
  assert.equal(fullResult.metrics.agentProviderCompletions, 0);
  assert.equal(fullResult.metrics.manualRecoveryManifests, 0);
  assert.notEqual(implicit.stdout, full.stdout);
  assert.ok(implicit.stdout.length < full.stdout.length);
  const selfBootstrapInput = JSON.parse(selfBootstrap.stdout);
  assert.equal(selfBootstrapInput.schemaVersion, 'buildr.task-finish-self-bootstrap-input/v1');
  assert.equal(selfBootstrapInput.detail, 'self-bootstrap');
  assert.equal(selfBootstrapInput.identity.taskId, 'current-inspect');
  assert.equal(selfBootstrapInput.mode, 'ineligible');
  assert.equal('resolvedContext' in selfBootstrapInput, false);
  assert.match(text.stdout, /旧运行只读保留/);
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

test('旧收尾写入口退出公开命令且不改变任务和资源', (t) => {
  const root = fixture(t, true);
  const run = create(root);
  const before = fs.readdirSync(root);
  for (const action of ['run', 'rollover', 'reconcile']) {
    const result = spawnSync(process.execPath, [cli, 'task', 'finish', action, '--task', run.identity.task, '--target', root, '--json'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(result.stdout).error.code, 'cli.unknown_command');
  }
  assert.deepEqual(fs.readdirSync(root), before);
});

test('已清退的 OpenSpec Legacy 帮助入口不再存在', () => {
  for (const topic of [['baseline', 'create'], ['check']]) {
    const result = spawnSync(process.execPath, [cli, 'help', 'openspec', ...topic], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /Unknown help topic/);
  }
});
