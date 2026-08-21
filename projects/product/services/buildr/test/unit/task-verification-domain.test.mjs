import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTaskVerificationResult } from '../../src/task/domain/task-verification.mjs';

function workspaceResult(overrides = {}) {
  return {
    schemaVersion: 'buildr.task-verification-result/v1',
    taskId: 'workspace-task',
    target: { identity: 'sha256-target', summary: 'Workspace Content Target' },
    declarations: [],
    capabilities: [],
    coverageGaps: [{ scope: 'workspace', summary: 'No workspace verification capability.' }],
    conclusion: { outcome: 'not-passed', summary: 'Workspace coverage gap remains.' },
    completedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

test('workspace-only Result 是稳定负向事实且不会自动 passed', () => {
  const first = normalizeTaskVerificationResult(workspaceResult());
  const second = normalizeTaskVerificationResult(workspaceResult());
  assert.deepEqual(first, second);
  assert.equal(first.conclusion.outcome, 'not-passed');
  assert.deepEqual(first.declarations, []);
  assert.deepEqual(first.capabilities, []);
});

test('空 declarations 拒绝缺口缺失、Project gap、capability 与 passed 组合', () => {
  for (const invalid of [
    workspaceResult({ coverageGaps: [] }),
    workspaceResult({ coverageGaps: [{ scope: 'project:demo', summary: 'Not workspace.' }] }),
    workspaceResult({ capabilities: [{ project: 'demo', capability: 'demo.check', outcome: 'passed', facts: ['passed'] }] }),
    workspaceResult({ conclusion: { outcome: 'passed', summary: 'Must not pass.' } }),
  ]) {
    assert.throws(() => normalizeTaskVerificationResult(invalid), (error) => ['task_verification_result_empty', 'task_verification_workspace_shape_invalid'].includes(error.code));
  }
});

test('Project declarations 与 workspace gap 不能组合', () => {
  assert.throws(() => normalizeTaskVerificationResult(workspaceResult({
    declarations: [{ project: 'demo', path: 'projects/demo/verification.yml', identity: 'absent' }],
  })), (error) => error.code === 'task_verification_workspace_shape_invalid');
});
