import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupTaskFinishDiagnosticsEvidence,
  createTaskFinishDiagnosticsEvidence,
} from '../../src/task/application/finish/diagnostics-evidence.mjs';
import { TASK_FINISH_RAW_COMMAND_OUTPUT } from '../../src/task/application/finish/execution-record.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-finish-diagnostics-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('Finish diagnostics按invocation写文件并只清理精确owner目录', (t) => {
  const root = fixture(t);
  const evidence = createTaskFinishDiagnosticsEvidence(root, 'finish-invocation-1');
  evidence.runOpened({ runId: 'finish-run-1', invocations: 2, status: 'active' });
  evidence.phaseStarted({ phase: 'deliver', attempt: 1, at: '2026-08-10T00:00:00.000Z' });
  const command = { kind: 'command', id: 'deliver-push', status: 0, startedAt: '2026-08-10T00:00:00.000Z', durationMs: 5, stdout: { bytes: 8, digest: 'sha256-stdout', truncated: false }, stderr: { bytes: 0, digest: 'sha256-stderr', truncated: false } };
  Object.defineProperty(command, TASK_FINISH_RAW_COMMAND_OUTPUT, { value: { stdout: 'pushed\n', stderr: '' }, enumerable: false });
  evidence.phaseFinished({ phase: 'deliver', attempt: 1, startedAt: '2026-08-10T00:00:00.000Z', completedAt: '2026-08-10T00:00:00.005Z', durationMs: 5, result: { status: 'passed', checks: [], operations: [command] } });
  evidence.finishStopped({ status: 'complete', at: '2026-08-10T00:00:00.006Z' });
  assert.deepEqual(fs.readdirSync(evidence.directory).sort(), ['diagnostics.json', 'stderr.txt', 'stdout.txt', 'summary.json', 'timeline.json']);
  assert.match(fs.readFileSync(path.join(evidence.directory, 'stdout.txt'), 'utf8'), /pushed/);
  const snapshot = evidence.snapshot();
  assert.equal(snapshot.finishRunId, 'finish-run-1');
  assert.equal(snapshot.invocationOrdinal, 2);
  assert.equal(snapshot.phaseResults[0].operations[0].id, 'deliver-push');
  const cleanup = cleanupTaskFinishDiagnosticsEvidence(evidence, { removePath: (value) => fs.rmSync(value, { recursive: true }) });
  assert.deepEqual({ ok: cleanup.ok, status: cleanup.status, code: cleanup.code }, { ok: true, status: 'cleaned', code: 'cleanup.removed' });
  assert.equal(fs.existsSync(evidence.directory), false);
});

test('Finish diagnostics cleanup拒绝伪造边界和identity', (t) => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-finish-foreign-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'summary.json'), JSON.stringify({ schemaVersion: 'buildr.task-finish-diagnostics-evidence/v1', invocationId: 'finish-invocation-2' }));
  let removed = false;
  const result = cleanupTaskFinishDiagnosticsEvidence({
    schemaVersion: 'buildr.task-finish-diagnostics-evidence/v1',
    invocationId: 'finish-invocation-2',
    workspaceRoot: root,
    evidenceRetention: 'transient',
    cleanupReference: outside,
    summaryPath: path.join(outside, 'summary.json'),
  }, { removePath: () => { removed = true; } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'cleanup.boundary-invalid');
  assert.equal(removed, false);
});

