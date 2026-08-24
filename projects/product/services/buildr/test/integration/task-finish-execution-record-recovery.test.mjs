import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';
import { createTaskFinishDiagnosticsEvidence } from '../../src/task/application/finish/diagnostics-evidence.mjs';
import {
  TASK_FINISH_EXECUTION_RECORD_KIND,
  TASK_FINISH_EXECUTION_RECORD_OWNER,
  TASK_FINISH_EXECUTION_RECORD_PRODUCER,
} from '../../src/task/application/finish/execution-record.mjs';
import { createFinishRun } from '../../src/task/application/finish/task-finish-run.mjs';

const BUILDR = path.resolve(import.meta.dirname, '../../bin/buildr.mjs');
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../../../../..');
const test = createBuildrApplicationTest('integration-task-finish-execution-record-recovery');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-finish-record-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Task Finish recovery fixture\n');
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1
id: 55555555-5555-4555-8555-555555555555
name: Task Finish recovery fixture
description: Task Finish recovery fixture
runtime:
  node:
    version: ${process.versions.node}
`);
  return fs.realpathSync(root);
}

function runIdentity(root, taskId, targetIdentity) {
  return {
    task: taskId,
    handoffIdentity: 'sha256-handoff',
    candidateIdentity: 'sha256-candidate',
    candidateGeneration: 1,
    contentTargetIdentity: targetIdentity,
    agent: 'codex',
    targetBranch: 'dev',
    remote: 'origin',
    environmentRoot: root,
    workspaceRoot: root,
  };
}

function failedEvidence(evidence) {
  const startedAt = new Date().toISOString();
  evidence.phaseStarted({ phase: 'deliver', attempt: 1, at: startedAt });
  const completedAt = new Date().toISOString();
  evidence.phaseFinished({
    phase: 'deliver',
    attempt: 1,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    result: {
      status: 'failed',
      checks: [],
      operations: [],
      failure: {
        phase: 'deliver',
        operation: 'persist-finish-current',
        failureClass: 'product-execution-failure',
        code: 'workspace_store_database_newer_than_runtime',
        status: 'failed',
        message: 'Old runtime cannot persist the migrated Finish current.',
      },
    },
  });
}

function stoppedEvidence(evidence, status) {
  const phaseStatus = status === 'complete' ? 'passed' : 'blocked';
  const startedAt = new Date().toISOString();
  evidence.phaseStarted({ phase: 'prepare', attempt: 1, at: startedAt });
  const completedAt = new Date().toISOString();
  evidence.phaseFinished({
    phase: 'prepare',
    attempt: 1,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    result: {
      status: phaseStatus,
      checks: [],
      operations: [],
      ...(phaseStatus === 'blocked' ? { failure: { code: 'task-finish.prepare-blocked', status: 'blocked', message: 'Prepare is resumably blocked.' } } : {}),
    },
  });
  evidence.finishStopped({ status, at: new Date().toISOString() });
}

function setup(t, name, { recordTarget = 'sha256-content-target', runTarget = 'sha256-content-target' } = {}) {
  const root = workspace(t);
  const runtime = t.buildrContexts.application;
  const taskId = `recover-${name}`;
  const finishRunId = `${taskId}-finish-run`;
  const invocationId = `${taskId}-invocation`;
  runtime.createTaskRecord(root, { taskId, title: name, intent: 'Recover an interrupted Task Finish diagnostics record.', projects: [], services: [], changes: [] });
  const run = createFinishRun({ root, runId: finishRunId, identity: runIdentity(root, taskId, runTarget), runtime });
  run.invocations = 1;
  runtime.writeTaskFinishRunPersistence(root, run);
  const opened = runtime.openTaskExecutionRecord(root, taskId, {
    owner: TASK_FINISH_EXECUTION_RECORD_OWNER,
    kind: TASK_FINISH_EXECUTION_RECORD_KIND,
    runIdentity: invocationId,
    targetIdentity: recordTarget,
    producer: TASK_FINISH_EXECUTION_RECORD_PRODUCER,
  });
  const evidence = createTaskFinishDiagnosticsEvidence(root, invocationId, { writeFile: runtime.atomicWriteFile });
  evidence.runOpened({ runId: finishRunId, invocations: 1, status: 'active' });
  return { root, runtime, taskId, finishRunId, invocationId, run, opened, evidence };
}

test('migration中断后的terminal failed phase可恢复原record且不改写Formal Finish', (t) => {
  const current = setup(t, 'interrupted-failed-phase');
  failedEvidence(current.evidence);
  const finishBefore = current.runtime.readTaskFinishRunPersistence(current.root, { runId: current.finishRunId }).content;

  const recoveryProcess = spawnSync(process.execPath, [
    BUILDR, 'task', 'execution-record', 'recover',
    '--task', current.taskId,
    '--record', current.opened.record.recordId,
    '--summary', current.evidence.summaryPath,
    '--target', current.root,
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(recoveryProcess.status, 0, recoveryProcess.stderr || recoveryProcess.stdout);
  const recovered = JSON.parse(recoveryProcess.stdout);
  assert.equal(recovered.status, 'recovered');
  assert.equal(recovered.record.outcome, 'failed');
  assert.equal(recovered.record.lifecycleStatus, 'retained');
  assert.deepEqual(recovered.transientCleanup, { status: 'cleaned', code: 'cleanup.removed' });
  assert.equal(fs.existsSync(current.evidence.directory), false);
  assert.equal(current.runtime.readTaskFinishRunPersistence(current.root, { runId: current.finishRunId }).content, finishBefore);
  assert.equal(current.runtime.inspectTaskRecord(current.root, current.taskId).record.status, 'active');

  const retainedRecord = current.runtime.inspectTaskExecutionRecord(current.root, current.opened.record.recordId).record;
  const summary = JSON.parse(current.runtime.readTaskExecutionRecordBodyFile(current.root, retainedRecord, 'summary.json').content);
  assert.equal(summary.schemaVersion, 'buildr.task-finish-execution-record-recovery-summary/v1');
  assert.equal(summary.timingSource, 'producer-terminal-phase');
  assert.equal(summary.finishRunId, current.finishRunId);
  assert.throws(
    () => current.runtime.cleanupTaskExecutionRecord(current.root, current.opened.record.recordId),
    (error) => error.code === 'task_execution_record_cleanup_not_eligible',
    'recovery不能绕过failed record的resolution与retention规则',
  );

  const repeated = current.runtime.recoverTaskExecutionRecord(current.root, current.taskId, current.opened.record.recordId, {
    summaryPath: current.evidence.summaryPath,
  });
  assert.equal(repeated.status, 'recovered');
  assert.deepEqual(repeated.effects.map((effect) => effect.type), ['reused', 'transient-cleaned']);
  assert.deepEqual(repeated.transientCleanup, { status: 'cleaned', code: 'cleanup.already-absent' });
  assert.equal(current.runtime.readTaskFinishRunPersistence(current.root, { runId: current.finishRunId }).content, finishBefore);
});

test('Task Finish recovery在Content Target identity mismatch时保持record与evidence零副作用', (t) => {
  const current = setup(t, 'identity-mismatch', { recordTarget: 'sha256-record-target', runTarget: 'sha256-finish-target' });
  failedEvidence(current.evidence);
  const finishBefore = current.runtime.readTaskFinishRunPersistence(current.root, { runId: current.finishRunId }).content;

  assert.throws(
    () => current.runtime.recoverTaskExecutionRecord(current.root, current.taskId, current.opened.record.recordId, { summaryPath: current.evidence.summaryPath }),
    (error) => error.code === 'task_execution_record_recovery_identity_mismatch',
  );
  assert.equal(current.runtime.inspectTaskExecutionRecord(current.root, current.opened.record.recordId).record.lifecycleStatus, 'open');
  assert.equal(fs.existsSync(current.evidence.directory), true);
  assert.equal(current.runtime.readTaskFinishRunPersistence(current.root, { runId: current.finishRunId }).content, finishBefore);
  const gc = current.runtime.gcTaskExecutionRecords(current.root, { limit: 100 });
  assert.equal(gc.counts.selected, 0, 'GC不能把open record当作recovery或cleanup candidate');
  assert.equal(current.runtime.inspectTaskExecutionRecord(current.root, current.opened.record.recordId).record.lifecycleStatus, 'open');
  assert.equal(fs.existsSync(current.evidence.directory), true);
});

test('producer finish-stopped evidence稳定映射passed与blocked outcomes', (t) => {
  for (const [name, finishStatus, outcome] of [['complete', 'complete', 'passed'], ['blocked', 'blocked', 'blocked']]) {
    const current = setup(t, `finish-stopped-${name}`);
    stoppedEvidence(current.evidence, finishStatus);
    const recovered = current.runtime.recoverTaskExecutionRecord(current.root, current.taskId, current.opened.record.recordId, {
      summaryPath: current.evidence.summaryPath,
    });
    assert.equal(recovered.record.outcome, outcome);
    assert.equal(recovered.record.lifecycleStatus, 'retained');
    assert.equal(fs.existsSync(current.evidence.directory), false);
  }
});

test('Task Finish cleanup失败保留已seal record与owned evidence，重试只复用并精确清理', (t) => {
  const current = setup(t, 'cleanup-retry');
  failedEvidence(current.evidence);
  const removePath = current.runtime.removePath;
  current.runtime.removePath = () => { throw new Error('injected cleanup failure'); };
  const first = current.runtime.recoverTaskExecutionRecord(current.root, current.taskId, current.opened.record.recordId, {
    summaryPath: current.evidence.summaryPath,
  });
  assert.equal(first.status, 'recovered');
  assert.equal(first.record.lifecycleStatus, 'retained');
  assert.deepEqual(first.transientCleanup, { status: 'retained', code: 'cleanup.remove-failed' });
  assert.equal(fs.existsSync(current.evidence.directory), true);

  current.runtime.removePath = removePath;
  const retried = current.runtime.recoverTaskExecutionRecord(current.root, current.taskId, current.opened.record.recordId, {
    summaryPath: current.evidence.summaryPath,
  });
  assert.deepEqual(retried.effects.map((effect) => effect.type), ['reused', 'transient-cleaned']);
  assert.deepEqual(retried.transientCleanup, { status: 'cleaned', code: 'cleanup.removed' });
  assert.equal(fs.existsSync(current.evidence.directory), false);
});

test('Task Finish不允许用Verification unknown授权替代terminal diagnostics', (t) => {
  const current = setup(t, 'unknown-forbidden');
  assert.throws(
    () => current.runtime.recoverTaskExecutionRecord(current.root, current.taskId, current.opened.record.recordId, { authorizeUnknownOutcome: true }),
    (error) => error.code === 'task_execution_record_recovery_authorization_unsupported',
  );
  assert.equal(current.runtime.inspectTaskExecutionRecord(current.root, current.opened.record.recordId).record.lifecycleStatus, 'open');
  assert.equal(fs.existsSync(current.evidence.directory), true);
});

test('Task Finish diagnostics transient由repository Git规则明确排除', () => {
  const ignored = spawnSync('git', ['check-ignore', '-q', '--', '.buildr/transient/task-finish/diagnostics/example/summary.json'], {
    cwd: REPOSITORY_ROOT,
  });
  assert.equal(ignored.status, 0, ignored.stderr?.toString() || 'machine-local transient path must be ignored');
});
