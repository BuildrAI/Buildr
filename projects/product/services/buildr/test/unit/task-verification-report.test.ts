import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTaskVerificationReport } from '../../src/task/domain/task-verification.ts';

function report(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'buildr.task-verification-report/v1',
    taskId: 'demo-task',
    scope: { projects: ['demo'], services: [] },
    content: { identity: 'git:tree-one', summary: 'Demo task content' },
    declarations: [{ project: 'demo', path: 'projects/demo/verification.yml', identity: 'sha256-map' }],
    checks: [{
      id: 'demo-unit', project: 'demo', testing: 'unit', selection: 'full', targets: ['all unit tests'],
      source: 'command', outcome: 'passed', summary: 'All unit tests passed', durationMs: 1200,
    }],
    gaps: [],
    conclusion: { outcome: 'passed', summary: 'Task-related checks passed' },
    completedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

test('normalizes a meaningful task completion report', () => {
  const normalized = normalizeTaskVerificationReport(report(), { expectedTaskId: 'demo-task' });
  assert.equal(normalized.schemaVersion, 'buildr.task-verification-report/v1');
  assert.equal(normalized.checks[0].selection, 'full');
  assert.equal(normalized.checks[0].mapStatus, 'declared');
  assert.equal(normalized.declarations[0].status, 'ready');
  assert.equal(normalized.conclusion.outcome, 'passed');
});

test('rejects empty, contradictory, and wrong-task reports', () => {
  assert.throws(() => normalizeTaskVerificationReport(report({ checks: [], gaps: [] })), { code: 'task_verification_report_empty' });
  assert.throws(() => normalizeTaskVerificationReport(report({ checks: [{ id: 'failed', project: 'demo', testing: 'unit', selection: 'full', targets: ['unit'], source: 'command', outcome: 'failed', summary: 'Failed' }] })), { code: 'task_verification_conclusion_inconsistent' });
  assert.throws(() => normalizeTaskVerificationReport(report({ checks: [], gaps: [{ testing: 'smoke', reason: 'No environment' }] })), { code: 'task_verification_conclusion_inconsistent' });
  assert.throws(() => normalizeTaskVerificationReport(report({ conclusion: { outcome: 'not-passed', summary: 'Not passed' } })), { code: 'task_verification_conclusion_inconsistent' });
  assert.throws(() => normalizeTaskVerificationReport(report({ gaps: [], conclusion: { outcome: 'incomplete', summary: 'Incomplete' } })), { code: 'task_verification_conclusion_inconsistent' });
  assert.throws(() => normalizeTaskVerificationReport(report({ checks: [{ id: 'failed', project: 'demo', testing: 'unit', selection: 'full', targets: ['unit'], source: 'command', outcome: 'failed', summary: 'Failed' }], gaps: [{ testing: 'smoke', reason: 'No environment' }], conclusion: { outcome: 'incomplete', summary: 'Incomplete' } })), { code: 'task_verification_conclusion_inconsistent' });
  assert.throws(() => normalizeTaskVerificationReport(report(), { expectedTaskId: 'another-task' }), { code: 'task_verification_task_identity_mismatch' });
});

test('allows passed checks with an explicit gap and incomplete checks without failures', () => {
  assert.equal(normalizeTaskVerificationReport(report({ gaps: [{ testing: 'smoke', reason: 'No environment' }] })).conclusion.outcome, 'passed');
  assert.equal(normalizeTaskVerificationReport(report({ gaps: [{ testing: 'smoke', reason: 'No environment' }], conclusion: { outcome: 'incomplete', summary: 'Smoke remains' } })).conclusion.outcome, 'incomplete');
});
