import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  createVerificationExecutionRecordFiles,
  publicVerificationExecutionRecord,
  verificationExecutionRecordOutcome,
} from '../../src/application/verification/execution-record.mjs';

function input(overrides = {}) {
  const root = path.resolve('/workspace');
  return {
    runId: 'verification-1',
    executionIdentity: 'sha256-execution',
    context: { taskId: 'task-1', scopes: [{ selector: 'project:demo', runtime: { identity: 'runtime' }, cli: { identity: 'cli' }, preparation: { identity: 'deps' }, projection: { identity: 'projection' } }] },
    targetRoot: root,
    targetIdentity: 'target:demo',
    targetStable: true,
    targetDrift: null,
    before: { kind: 'git-worktree', root, head: 'head', tree: 'tree', changedPaths: [], fingerprint: 'before', reusable: false },
    after: { kind: 'git-worktree', root, head: 'head', tree: 'tree', changedPaths: [], fingerprint: 'after', reusable: false },
    projectCode: 'demo',
    declarationPath: path.join(root, 'projects/demo/verification.yml'),
    declarationIdentity: 'sha256-declaration',
    workspaceNode: { identity: { version: '24.0.0', digest: 'sha256-node' }, executable: '/secret/node', actualVersion: '24.0.0' },
    selectedCapabilities: [{ id: 'demo.test', scope: { project: 'demo', services: [] }, proves: ['tests'], requiredForDelivery: true, resourceClaims: [] }],
    authorizedCapabilities: [],
    authorizedResources: [],
    checks: [{ id: 'demo.test', title: 'test', status: 'passed', exitCode: 0, signal: null, durationMs: 5, queuedAt: '2026-08-09T00:00:00.000Z', startedAt: '2026-08-09T00:00:00.001Z', finishedAt: '2026-08-09T00:00:00.006Z', stdout: 'ok', stderr: '' }],
    outcome: 'passed',
    durationMs: 6,
    startedAt: '2026-08-09T00:00:00.000Z',
    finishedAt: '2026-08-09T00:00:00.006Z',
    ...overrides,
  };
}

test('Verification execution record mapper 只生成受控可移植正文', () => {
  const value = input();
  value.checks[0].resourceCoordination = {
    waitDurationMs: 3,
    acquiredAt: value.startedAt,
    claims: [{ resource: 'slot', strategy: 'coordinated', slot: 0, recovered: false, status: 'acquired', owner: { token: 'secret-token' } }],
    release: [{ resource: 'slot', slot: 0, status: 'released', token: 'secret-token' }],
  };
  const files = createVerificationExecutionRecordFiles(value);
  assert.deepEqual(files.map((file) => file.name), ['summary.json', 'stdout.txt', 'stderr.txt', 'timeline.json', 'diagnostics.json']);
  const summary = files.find((file) => file.name === 'summary.json').content;
  assert.equal(summary.declaration.path, 'projects/demo/verification.yml');
  assert.equal(summary.workspaceNode.executable, undefined);
  assert.equal(summary.target.before.root, undefined);
  assert.equal(summary.task.scopes[0].executionRoot, undefined);
  assert.equal(summary.checks[0].resourceCoordination.claims[0].owner, undefined);
  assert.equal(summary.checks[0].resourceCoordination.claims[0].token, undefined);
  assert.match(summary.scopeIdentity, /^sha256-/);
  assert.match(files.find((file) => file.name === 'stdout.txt').content, /=== capability: demo.test ===\nok/);
  assert.throws(() => createVerificationExecutionRecordFiles(input({ secretEnvironment: { TOKEN: 'secret' } })), /Unsupported Verification execution record field/);
});

test('Verification execution record outcome 区分失败、取消和容量阻塞', () => {
  assert.equal(verificationExecutionRecordOutcome({ passed: true }), 'passed');
  assert.equal(verificationExecutionRecordOutcome({ passed: false, checks: [{ signal: 'SIGTERM' }] }), 'cancelled');
  assert.equal(verificationExecutionRecordOutcome({ passed: false, blocked: true }), 'blocked');
  assert.equal(verificationExecutionRecordOutcome({ passed: false, checks: [{ signal: null }] }), 'failed');
});

test('公开 executionRecord 摘要不泄露 body locator', () => {
  const value = publicVerificationExecutionRecord('retained', { record: {
    recordId: 'task-exec-1', outcome: 'passed', lifecycleStatus: 'retained',
    body: { locator: '.buildr/local/task-execution-records/task-verification/task-exec-1/', digest: 'sha256-body', storedSizeBytes: 10, originalSizeBytes: 12, truncated: false },
  } });
  assert.equal(value.body.locator, undefined);
  assert.equal(value.recordId, 'task-exec-1');
  assert.equal(value.status, 'retained');
});
