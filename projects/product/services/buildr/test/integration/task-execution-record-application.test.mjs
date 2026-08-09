import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createOpenTaskExecutionRecord, resolveTaskExecutionRecord, sealTaskExecutionRecord } from '../../src/domain/task-execution-record/task-execution-record.mjs';

function taskRecord(taskId) {
  return {
    schemaVersion: 'buildr.task-record/v1', taskId, title: taskId, intent: 'Exercise execution record base',
    scope: { projects: [], services: [] }, changes: [], parentTaskId: null, childTaskIds: [], status: 'active', result: null,
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
  assert.equal(runtime.cleanupTaskExecutionRecord(root, opened.record.recordId).status, 'reused');
});
