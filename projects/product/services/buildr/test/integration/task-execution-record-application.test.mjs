import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import {
  beginTaskExecutionRecordCleanup,
  completeTaskExecutionRecordCleanup,
  createOpenTaskExecutionRecord,
  resolveTaskExecutionRecord,
  sealTaskExecutionRecord,
} from '../../src/domain/task-execution-record/task-execution-record.mjs';
import { TASK_EXECUTION_RECORD_BODY_READ_LIMIT_BYTES } from '../../src/infrastructure/filesystem/task-execution-record-body-store.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

function taskRecord(taskId) {
  return {
    schemaVersion: 'buildr.task-record/v2', taskId, title: taskId, intent: 'Exercise execution record base',
    scope: { projects: [], services: [] }, changes: [], parentTaskId: null, childTaskIds: [], retrospectiveSourceTaskIds: [], status: 'active', result: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function fixture(t, taskIds = ['record-task']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-execution-record-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Fixture\n');
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 44444444-4444-4444-8444-444444444444\nname: Fixture\ndescription: Fixture\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = createRuntime();
  for (const taskId of taskIds) runtime.createTaskRecordPersistence(root, taskRecord(taskId));
  return { root: fs.realpathSync(root), runtime };
}

function open(runtime, root, taskId = 'record-task', runIdentity = 'run-1', owner = 'task-verification') {
  return runtime.openTaskExecutionRecord(root, taskId, {
    owner,
    kind: owner === 'task-verification' ? 'verification-execution' : 'finish-diagnostics',
    runIdentity,
    targetIdentity: `target-${runIdentity}`,
    producer: 'integration-test',
  });
}

function seedReservations(runtime, root, entries) {
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  const statement = opened.database.prepare(`INSERT INTO task_execution_records(
    record_id, schema_version, task_id, owner, kind, run_identity, target_identity, producer,
    outcome, lifecycle_status, resolution_status, body_status, quota_status, body_locator, body_digest,
    stored_size_bytes, original_size_bytes, truncated, redaction_version, reserved_size_bytes, retain_until,
    opened_at, sealed_at, resolved_at, cleanup_started_at, cleaned_at, cleanup_code, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  opened.database.exec('BEGIN IMMEDIATE');
  try {
    for (const [index, entry] of entries.entries()) {
      const record = createOpenTaskExecutionRecord({
        recordId: `seed-${entry.taskId}-${entry.owner}-${entry.runIdentity}`,
        taskId: entry.taskId,
        owner: entry.owner,
        kind: entry.owner === 'task-verification' ? 'verification-execution' : 'finish-diagnostics',
        runIdentity: entry.runIdentity,
        targetIdentity: `target-${index}`,
        producer: 'quota-fixture',
        openedAt: new Date(Date.parse('2026-01-01T00:00:00.000Z') + index).toISOString(),
      });
      statement.run(
        record.recordId, record.schemaVersion, record.taskId, record.owner, record.kind, record.runIdentity, record.targetIdentity, record.producer,
        record.outcome, record.lifecycleStatus, record.resolutionStatus, record.bodyStatus, record.quotaStatus, record.body.locator, record.body.digest,
        record.body.storedSizeBytes, record.body.originalSizeBytes, 0, record.body.redactionVersion, record.body.reservedSizeBytes,
        record.retention.retainUntil, record.timestamps.openedAt, record.timestamps.sealedAt, record.timestamps.resolvedAt,
        record.timestamps.cleanupStartedAt, record.timestamps.cleanedAt, record.cleanupCode, record.timestamps.updatedAt,
      );
    }
    opened.database.exec('COMMIT');
  } catch (error) {
    try { opened.database.exec('ROLLBACK'); } catch {}
    throw error;
  } finally { opened.database.close(); }
}

function retained(runtime, root, runIdentity, { outcome = 'passed', sealedAt = '2025-01-01T00:00:00.000Z' } = {}) {
  const opened = open(runtime, root, 'record-task', runIdentity);
  const persisted = runtime.readTaskExecutionRecordPersistence(root, opened.record.recordId);
  const body = runtime.publishTaskExecutionRecordBody(root, persisted.record, [{ name: 'summary.json', content: { runIdentity } }]);
  let record = sealTaskExecutionRecord(persisted.record, body, outcome, sealedAt);
  if (outcome !== 'passed') record = resolveTaskExecutionRecord(record, 'recovered', '2025-02-15T00:00:00.000Z');
  runtime.replaceTaskExecutionRecordPersistence(root, persisted.record, record);
  return record;
}

function cleanedTombstone(runtime, root, runIdentity, cleanedAt) {
  const opened = open(runtime, root, 'record-task', runIdentity);
  const persisted = runtime.readTaskExecutionRecordPersistence(root, opened.record.recordId);
  const body = {
    locator: `.buildr/local/task-execution-records/task-verification/${persisted.record.recordId}/`,
    digest: `sha256-${persisted.record.recordId.replace(/[^a-f0-9]/gu, 'a').padEnd(64, 'a').slice(0, 64)}`,
    storedSizeBytes: 1,
    originalSizeBytes: 1,
    truncated: false,
  };
  const failed = sealTaskExecutionRecord(persisted.record, body, 'failed', '2025-01-01T00:00:00.000Z');
  const resolved = resolveTaskExecutionRecord(failed, 'recovered', '2025-02-01T00:00:00.000Z');
  const pending = beginTaskExecutionRecordCleanup(resolved, '2025-02-02T00:00:00.000Z');
  const cleaned = completeTaskExecutionRecordCleanup(pending, 'body-already-absent', cleanedAt);
  runtime.replaceTaskExecutionRecordPersistence(root, persisted.record, cleaned);
  return cleaned;
}

function invocationInput(invocationIdentity, runIdentity) {
  return {
    owner: 'task-verification', kind: 'verification-execution', runIdentity, invocationIdentity,
    targetIdentity: 'target-stable', producer: 'integration-test',
  };
}

function seedOpenInvocation(runtime, root, { recordId, invocationIdentity, runIdentity, openedAt }) {
  const record = createOpenTaskExecutionRecord({
    recordId, taskId: 'record-task', ...invocationInput(invocationIdentity, runIdentity), openedAt,
  });
  return runtime.openTaskExecutionRecordPersistence(root, record, { allowDuplicateInvocation: true }).record;
}

function seedTerminalInvocation(runtime, root, { recordId, invocationIdentity, runIdentity, outcome, lifecycleStatus, openedAt }) {
  const opened = seedOpenInvocation(runtime, root, { recordId, invocationIdentity, runIdentity, openedAt });
  const persisted = runtime.readTaskExecutionRecordPersistence(root, opened.recordId);
  const body = runtime.publishTaskExecutionRecordBody(root, persisted.record, [{ name: 'summary.json', content: { runIdentity, outcome } }]);
  let record = sealTaskExecutionRecord(persisted.record, body, outcome, '2026-01-02T00:00:00.000Z', { attention: lifecycleStatus === 'attention' });
  if (['cleanup_pending', 'cleaned'].includes(lifecycleStatus)) {
    if (outcome !== 'passed') record = resolveTaskExecutionRecord(record, 'recovered', '2026-01-02T01:00:00.000Z');
    record = beginTaskExecutionRecordCleanup(record, '2026-01-03T00:00:00.000Z');
  }
  if (lifecycleStatus === 'cleaned') record = completeTaskExecutionRecordCleanup(record, 'body-deleted', '2026-01-04T00:00:00.000Z');
  runtime.replaceTaskExecutionRecordPersistence(root, persisted.record, record);
  return record;
}

test('Application open幂等、seal、inspect/list和failure resolution共享单一authority', (t) => {
  const { root, runtime } = fixture(t);
  const first = open(runtime, root);
  const reused = open(runtime, root);
  assert.equal(first.status, 'opened');
  assert.equal(reused.status, 'reused');
  assert.equal(reused.record.recordId, first.record.recordId);
  assert.throws(() => runtime.openTaskExecutionRecord(root, 'record-task', {
    owner: 'task-verification', kind: 'verification-execution', runIdentity: 'run-1', targetIdentity: 'changed', producer: 'integration-test',
  }), (error) => error.code === 'task_execution_record_open_conflict');

  const sealed = runtime.sealTaskExecutionRecord(root, first.record.recordId, {
    outcome: 'failed', files: [{ name: 'summary.json', content: { conclusion: 'failed' } }, { name: 'stderr.txt', content: 'failure' }],
  });
  assert.equal(sealed.record.lifecycleStatus, 'retained');
  assert.equal(runtime.inspectTaskExecutionRecord(root, first.record.recordId).record.body.digest, sealed.record.body.digest);
  assert.equal(runtime.listTaskExecutionRecords(root, 'record-task', { owner: 'task-verification' }).records.length, 1);
  assert.equal(runtime.sealTaskExecutionRecord(root, first.record.recordId, { outcome: 'failed', files: [] }).status, 'reused');
  const resolved = runtime.resolveTaskExecutionRecord(root, first.record.recordId, { resolutionStatus: 'acknowledged' });
  assert.equal(resolved.record.resolutionStatus, 'acknowledged');
});

test('相同invocation identity原子复用active或terminal record，显式retry才创建新record', (t) => {
  const { root, runtime } = fixture(t);
  const invocationIdentity = `sha256-${'a'.repeat(64)}`;
  const input = {
    owner: 'task-verification', kind: 'verification-execution', invocationIdentity,
    targetIdentity: 'target-stable', producer: 'integration-test',
  };
  const first = runtime.openTaskExecutionRecord(root, 'record-task', { ...input, runIdentity: 'run-first' });
  const active = runtime.openTaskExecutionRecord(root, 'record-task', { ...input, runIdentity: 'run-second' });
  assert.equal(first.status, 'opened');
  assert.equal(active.status, 'existing-active');
  assert.equal(active.record.recordId, first.record.recordId);
  assert.equal(runtime.listTaskExecutionRecords(root, 'record-task').records.length, 1);

  const retry = runtime.openTaskExecutionRecord(root, 'record-task', { ...input, runIdentity: 'run-retry', allowDuplicateInvocation: true });
  assert.equal(retry.status, 'opened');
  assert.notEqual(retry.record.recordId, first.record.recordId);
  assert.equal(runtime.listTaskExecutionRecords(root, 'record-task').records.length, 2);

  runtime.sealTaskExecutionRecord(root, retry.record.recordId, { outcome: 'failed', files: [{ name: 'summary.json', content: { outcome: 'failed' } }] });
  const stillActive = runtime.openTaskExecutionRecord(root, 'record-task', { ...input, runIdentity: 'run-third' });
  assert.equal(stillActive.status, 'existing-active');
  assert.equal(stillActive.record.recordId, first.record.recordId, 'active必须优先于terminal历史');

  runtime.sealTaskExecutionRecord(root, first.record.recordId, { outcome: 'passed', files: [{ name: 'summary.json', content: { outcome: 'passed' } }] });
  const terminal = runtime.openTaskExecutionRecord(root, 'record-task', { ...input, runIdentity: 'run-fourth' });
  assert.equal(terminal.status, 'existing-terminal');
  assert.equal(terminal.record.recordId, retry.record.recordId, 'latest terminal按openedAt选择显式retry record');
  assert.equal(runtime.listTaskExecutionRecords(root, 'record-task').records.length, 2);
});

test('terminal closed states全部参与复用且保留原outcome/lifecycle', (t) => {
  const { root, runtime } = fixture(t);
  const matrix = [
    ['passed', 'retained'],
    ['failed', 'cleanup_pending'],
    ['blocked', 'cleaned'],
    ['cancelled', 'attention'],
  ];
  for (const [index, [outcome, lifecycleStatus]] of matrix.entries()) {
    const invocationIdentity = `sha256-${String(index + 1).repeat(64)}`;
    const seeded = seedTerminalInvocation(runtime, root, {
      recordId: `task-exec-${outcome}`,
      invocationIdentity,
      runIdentity: `run-${outcome}`,
      outcome,
      lifecycleStatus,
      openedAt: `2026-01-01T00:00:0${index}.000Z`,
    });
    const reused = runtime.openTaskExecutionRecord(root, 'record-task', {
      ...invocationInput(invocationIdentity, `run-${outcome}-default`),
    });
    assert.equal(reused.status, 'existing-terminal');
    assert.equal(reused.record.recordId, seeded.recordId);
    assert.equal(reused.record.outcome, outcome);
    assert.equal(reused.record.lifecycleStatus, lifecycleStatus);
  }
});

test('exact identity latest选择使用openedAt与recordId降序且active优先', (t) => {
  const { root, runtime } = fixture(t);
  const invocationIdentity = `sha256-${'e'.repeat(64)}`;
  const openedAt = '2026-01-01T00:00:00.000Z';
  seedTerminalInvocation(runtime, root, {
    recordId: 'task-exec-terminal-a', invocationIdentity, runIdentity: 'run-terminal-a', outcome: 'failed', lifecycleStatus: 'retained', openedAt,
  });
  const terminalB = seedTerminalInvocation(runtime, root, {
    recordId: 'task-exec-terminal-b', invocationIdentity, runIdentity: 'run-terminal-b', outcome: 'passed', lifecycleStatus: 'retained', openedAt,
  });
  const latestTerminal = runtime.openTaskExecutionRecord(root, 'record-task', {
    ...invocationInput(invocationIdentity, 'run-default-terminal'),
  });
  assert.equal(latestTerminal.status, 'existing-terminal');
  assert.equal(latestTerminal.record.recordId, terminalB.recordId);

  seedOpenInvocation(runtime, root, { recordId: 'task-exec-active-a', invocationIdentity, runIdentity: 'run-active-a', openedAt });
  const activeB = seedOpenInvocation(runtime, root, { recordId: 'task-exec-active-b', invocationIdentity, runIdentity: 'run-active-b', openedAt });
  const latestActive = runtime.openTaskExecutionRecord(root, 'record-task', {
    ...invocationInput(invocationIdentity, 'run-default-active'),
  });
  assert.equal(latestActive.status, 'existing-active');
  assert.equal(latestActive.record.recordId, activeB.recordId);
  assert.deepEqual(runtime.listTaskExecutionRecords(root, 'record-task').records.map((record) => record.recordId), [
    'task-exec-terminal-b', 'task-exec-terminal-a', 'task-exec-active-b', 'task-exec-active-a',
  ]);
});

test('紧凑inspect只读返回验证终态、耗时、失败与可移植evidence摘要', (t) => {
  const { root, runtime } = fixture(t);
  const opened = open(runtime, root, 'record-task', 'verification-compact');
  runtime.sealTaskExecutionRecord(root, opened.record.recordId, {
    outcome: 'failed',
    files: [
      { name: 'summary.json', content: { outcome: 'failed', durationMs: 1234, timingSource: 'wrapper-measured', startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.234Z', project: { code: 'demo' }, target: { identity: 'target-compact' }, declaration: { identity: `sha256-${'b'.repeat(64)}` }, selectedCapabilities: [{ id: 'demo.test' }] } },
      { name: 'diagnostics.json', content: { failures: [{ capabilityId: 'demo.test', exitCode: 1 }], diagnostic: null } },
    ],
  });
  const compact = runtime.inspectTaskExecutionRecordCompactView(root, 'record-task', opened.record.recordId);
  assert.equal(compact.schemaVersion, 'buildr.task-execution-record-inspect-result/v1');
  assert.equal(compact.execution.status, 'available');
  assert.equal(compact.execution.durationMs, 1234);
  assert.deepEqual(compact.execution.failures, [{ capabilityId: 'demo.test', exitCode: 1 }]);
  assert.equal(JSON.stringify(compact).includes(root), false);

  const list = spawnSync(process.execPath, [BUILDR, 'task', 'execution-record', 'list', '--task', 'record-task', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(list.status, 0, list.stderr || list.stdout);
  assert.equal(JSON.parse(list.stdout).records[0].recordId, opened.record.recordId);
  const inspect = spawnSync(process.execPath, [BUILDR, 'task', 'execution-record', 'inspect', '--task', 'record-task', '--record', opened.record.recordId, '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(inspect.status, 0, inspect.stderr || inspect.stdout);
  assert.equal(JSON.parse(inspect.stdout).execution.durationMs, 1234);
});

test('Task-owner与Workspace quota在producer前backpressure且失败不创建row', (t) => {
  const taskIds = ['quota-1', 'quota-2', 'quota-3', 'quota-4', 'quota-5'];
  const { root, runtime } = fixture(t, taskIds);
  seedReservations(runtime, root, Array.from({ length: 16 }, (_, index) => ({ taskId: 'quota-1', owner: 'task-verification', runIdentity: `verification-${index}` })));
  assert.throws(() => open(runtime, root, 'quota-1', 'verification-overflow'), (error) => error.code === 'task_execution_record_task_owner_quota_exhausted');
  assert.equal(runtime.listTaskExecutionRecords(root, 'quota-1').records.length, 16);

  const remaining = [];
  for (const taskId of taskIds.slice(0, 4)) {
    const verificationStart = taskId === 'quota-1' ? 16 : 0;
    for (let index = verificationStart; index < 16; index += 1) remaining.push({ taskId, owner: 'task-verification', runIdentity: `verification-${index}` });
    for (let index = 0; index < 16; index += 1) remaining.push({ taskId, owner: 'task-finish', runIdentity: `finish-${index}` });
  }
  seedReservations(runtime, root, remaining);
  assert.throws(() => open(runtime, root, 'quota-5', 'workspace-overflow'), (error) => error.code === 'task_execution_record_workspace_quota_exhausted');
  assert.equal(runtime.listTaskExecutionRecords(root, 'quota-5').records.length, 0);
});

test('portable view复用同一authority并安全读取限量正文', (t) => {
  const { root, runtime } = fixture(t, ['record-task', 'other-task']);
  const verification = open(runtime, root, 'record-task', 'verification-run');
  const finish = open(runtime, root, 'record-task', 'finish-run', 'task-finish');
  const largeOutput = '输出'.repeat(TASK_EXECUTION_RECORD_BODY_READ_LIMIT_BYTES);
  runtime.sealTaskExecutionRecord(root, verification.record.recordId, {
    outcome: 'failed',
    files: [{ name: 'summary.json', content: { conclusion: 'failed' } }, { name: 'stdout.txt', content: largeOutput }],
  });
  runtime.sealTaskExecutionRecord(root, finish.record.recordId, {
    outcome: 'passed',
    files: [{ name: 'diagnostics.json', content: { conclusion: 'passed' } }],
  });

  const all = runtime.listTaskExecutionRecordView(root, 'record-task');
  const verificationOnly = runtime.listTaskExecutionRecordView(root, 'record-task', { view: 'verification' });
  const finishOnly = runtime.listTaskExecutionRecordView(root, 'record-task', { view: 'finish' });
  assert.equal(all.schemaVersion, 'buildr.task-execution-record-list-view/v1');
  assert.equal(all.records.length, 2);
  assert.deepEqual(verificationOnly.records.map((record) => record.owner), ['task-verification']);
  assert.deepEqual(finishOnly.records.map((record) => record.owner), ['task-finish']);
  assert.equal(JSON.stringify(all).includes('.buildr/local/task-execution-records'), false);
  assert.equal(JSON.stringify(all).includes(root), false);
  assert.equal('reservedSizeBytes' in all.records[0].body, false);
  assert.throws(() => runtime.listTaskExecutionRecordView(root, 'record-task', { view: 'resources' }), (error) => error.code === 'task_execution_record_view_invalid');

  const detail = runtime.inspectTaskExecutionRecordView(root, 'record-task', verification.record.recordId);
  assert.equal(detail.schemaVersion, 'buildr.task-execution-record-detail-view/v1');
  assert.deepEqual(detail.record.body.files.map((file) => file.name), ['summary.json', 'stdout.txt']);
  const body = runtime.readTaskExecutionRecordBodyFileView(root, 'record-task', verification.record.recordId, 'stdout.txt');
  assert.equal(body.schemaVersion, 'buildr.task-execution-record-body-file/v1');
  assert.equal(body.file.responseTruncated, true);
  assert.ok(body.file.responseSizeBytes <= TASK_EXECUTION_RECORD_BODY_READ_LIMIT_BYTES);
  assert.throws(() => runtime.readTaskExecutionRecordBodyFileView(root, 'record-task', verification.record.recordId, '../secret'), (error) => error.code === 'task_execution_record_body_name_forbidden');
  assert.throws(() => runtime.inspectTaskExecutionRecordView(root, 'other-task', verification.record.recordId), (error) => error.code === 'task_execution_record_not_found');
  assert.throws(() => runtime.readTaskExecutionRecordBodyFileView(root, 'other-task', verification.record.recordId, 'stdout.txt'), (error) => error.code === 'task_execution_record_not_found');

  const persisted = runtime.readTaskExecutionRecordPersistence(root, verification.record.recordId);
  fs.writeFileSync(path.join(root, persisted.record.body.locator, 'stdout.txt'), 'tampered output');
  const damaged = runtime.inspectTaskExecutionRecordView(root, 'record-task', verification.record.recordId);
  assert.equal(damaged.record.body.available, false);
  assert.equal(damaged.record.body.diagnostic.code, 'task_execution_record_body_integrity_mismatch');
  assert.equal(JSON.stringify(damaged).includes(persisted.record.body.locator), false);
  assert.throws(() => runtime.readTaskExecutionRecordBodyFileView(root, 'record-task', verification.record.recordId, 'stdout.txt'), (error) => {
    assert.equal(error.code, 'task_execution_record_body_integrity_mismatch');
    assert.deepEqual(error.details, { recordId: verification.record.recordId, filename: 'stdout.txt' });
    assert.equal(JSON.stringify(error.details).includes(root), false);
    return true;
  });
});

test('metadata seal失败后保留正文并尽力标记attention', (t) => {
  const { root, runtime } = fixture(t);
  const opened = open(runtime, root);
  const replace = runtime.replaceTaskExecutionRecordPersistence;
  let injected = false;
  runtime.replaceTaskExecutionRecordPersistence = (...args) => {
    if (!injected) { injected = true; throw new Error('injected metadata failure'); }
    return replace(...args);
  };
  assert.throws(() => runtime.sealTaskExecutionRecord(root, opened.record.recordId, { outcome: 'blocked', files: [{ name: 'stdout.txt', content: 'blocked' }] }), /injected metadata failure/u);
  const current = runtime.inspectTaskExecutionRecord(root, opened.record.recordId).record;
  assert.equal(current.lifecycleStatus, 'attention');
  assert.equal(fs.existsSync(path.join(root, current.body.locator, '.record-manifest.json')), true);
  const recovered = runtime.sealTaskExecutionRecord(root, opened.record.recordId, { outcome: 'blocked', files: [{ name: 'stdout.txt', content: 'ignored retry input' }] });
  assert.equal(recovered.status, 'recovered');
  assert.equal(recovered.record.lifecycleStatus, 'retained');
});

test('eligible failure单记录cleanup可从cleanup_pending重试并保留tombstone', (t) => {
  const { root, runtime } = fixture(t);
  const opened = open(runtime, root);
  const persisted = runtime.readTaskExecutionRecordPersistence(root, opened.record.recordId);
  const body = runtime.publishTaskExecutionRecordBody(root, persisted.record, [{ name: 'diagnostics.json', content: { failure: true } }]);
  const failed = sealTaskExecutionRecord(persisted.record, body, 'failed', '2026-01-02T00:00:00.000Z');
  const resolved = resolveTaskExecutionRecord(failed, 'recovered', '2026-02-02T00:00:00.000Z');
  runtime.replaceTaskExecutionRecordPersistence(root, persisted.record, resolved);
  const cleaned = runtime.cleanupTaskExecutionRecord(root, opened.record.recordId);
  assert.equal(cleaned.record.lifecycleStatus, 'cleaned');
  assert.equal(cleaned.record.body.locator, null);
  assert.equal(cleaned.record.body.digest, body.digest);
  assert.equal(cleaned.record.body.storedSizeBytes, body.storedSizeBytes);
  const detail = runtime.inspectTaskExecutionRecordView(root, 'record-task', opened.record.recordId);
  assert.equal(detail.record.body.available, false);
  assert.equal(detail.record.body.status, 'cleaned');
  assert.throws(() => runtime.readTaskExecutionRecordBodyFileView(root, 'record-task', opened.record.recordId, 'diagnostics.json'), (error) => error.code === 'task_execution_record_body_unavailable' && error.status === 410);
  assert.equal(runtime.cleanupTaskExecutionRecord(root, opened.record.recordId).status, 'reused');
});

test('Workspace GC dry-run零写入且bounded run只清理最近三条之外的passed正文', (t) => {
  const { root, runtime } = fixture(t);
  const records = Array.from({ length: 5 }, (_, index) => retained(runtime, root, `passed-${index}`, { sealedAt: `2025-01-0${index + 1}T00:00:00.000Z` }));
  const dryRun = runtime.gcTaskExecutionRecords(root, { dryRun: true, limit: 1 });
  assert.equal(dryRun.status, 'planned');
  assert.equal(dryRun.counts.selected, 1);
  assert.equal(dryRun.records[0].status, 'eligible');
  assert.equal(runtime.inspectTaskExecutionRecord(root, dryRun.records[0].recordId).record.lifecycleStatus, 'retained');

  const result = runtime.gcTaskExecutionRecords(root, { limit: 1 });
  assert.equal(result.status, 'completed');
  assert.equal(result.counts.cleaned, 1);
  assert.equal(runtime.inspectTaskExecutionRecord(root, result.records[0].recordId).record.lifecycleStatus, 'cleaned');
  const protectedRecords = records.slice(-3).map((record) => runtime.inspectTaskExecutionRecord(root, record.recordId).record.lifecycleStatus);
  assert.deepEqual(protectedRecords, ['retained', 'retained', 'retained']);
});

test('Workspace GC恢复cleanup_pending、隔离单条失败并继续后续candidate', (t) => {
  const { root, runtime } = fixture(t);
  retained(runtime, root, 'failure-one', { outcome: 'failed' });
  retained(runtime, root, 'failure-two', { outcome: 'failed' });
  const cleanupBody = runtime.cleanupTaskExecutionRecordBody;
  let injected = false;
  runtime.cleanupTaskExecutionRecordBody = (...args) => {
    if (!injected) { injected = true; throw new Error('injected body cleanup failure'); }
    return cleanupBody(...args);
  };
  const result = runtime.gcTaskExecutionRecords(root, { limit: 2 });
  assert.equal(result.status, 'partial');
  assert.equal(result.counts.failed, 1);
  assert.equal(result.counts.cleaned, 1);
  assert.equal(result.records.some((record) => record.diagnostic?.message.includes(root)), false);

  const pending = result.records.find((record) => record.status === 'failed');
  assert.equal(runtime.inspectTaskExecutionRecord(root, pending.recordId).record.lifecycleStatus, 'cleanup_pending');
  runtime.cleanupTaskExecutionRecordBody = cleanupBody;
  const resumed = runtime.gcTaskExecutionRecords(root, { limit: 1 });
  assert.equal(resumed.records[0].recordId, pending.recordId);
  assert.equal(resumed.records[0].status, 'cleaned');
});

test('Workspace GC仅删除满90天且超出最近20条的cleaned tombstone', (t) => {
  const { root, runtime } = fixture(t);
  const tombstones = Array.from({ length: 21 }, (_, index) => cleanedTombstone(runtime, root, `tombstone-${index}`, `2025-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`));
  const result = runtime.gcTaskExecutionRecords(root, { limit: 10 });
  assert.equal(result.counts.purged, 1);
  assert.equal(result.records[0].recordId, tombstones[0].recordId);
  assert.equal(runtime.readTaskExecutionRecordPersistence(root, tombstones[0].recordId, { optional: true }), null);
  assert.notEqual(runtime.readTaskExecutionRecordPersistence(root, tombstones[1].recordId, { optional: true }), null);
});

test('ExecRecord GC CLI提供stable dry-run JSON并拒绝force/path策略输入', (t) => {
  const { root, runtime } = fixture(t);
  for (let index = 0; index < 4; index += 1) retained(runtime, root, `cli-passed-${index}`, { sealedAt: `2025-01-0${index + 1}T00:00:00.000Z` });
  const run = (args, expected = 0) => {
    const result = spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
    assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };
  const dryRun = run(['task', 'execution-record', 'gc', '--target', root, '--dry-run', '--limit', '1', '--json']);
  assert.equal(dryRun.schemaVersion, 'buildr.task-execution-record-gc-result/v1');
  assert.equal(dryRun.status, 'planned');
  assert.equal(dryRun.counts.selected, 1);
  assert.equal(JSON.stringify(dryRun).includes(root), false);
  assert.equal(runtime.inspectTaskExecutionRecord(root, dryRun.records[0].recordId).record.lifecycleStatus, 'retained');

  const invalid = run(['task', 'execution-record', 'gc', '--target', root, '--force', '--json'], 1);
  assert.equal(invalid.status, 'blocked');
  assert.equal(invalid.diagnostic.code, 'task_execution_record_gc_cli.syntax');
  assert.equal(invalid.counts.selected, 0);
});
