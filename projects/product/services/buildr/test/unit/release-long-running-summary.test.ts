import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compactReleaseTransaction } from '../../tools/release/release-transaction-runner.ts';
import { compactReleaseTransactionInspect } from '../../tools/release/release-transaction-evidence.ts';

test('release transaction compact保留evidence identity与inspect入口', () => {
  const evidence: any = {
    identity: 'sha256-release-evidence', status: 'passed',
    publish: { runId: 42 },
    context: { preparation: { taskId: 'release-task' } },
    attempt: { steps: [{ id: 'npm', status: 'passed' }] },
  };
  const output: any = compactReleaseTransaction({
    schemaVersion: 'buildr.release-transaction-runner/v3', action: 'dispatch', status: 'passed',
    context: evidence.context, evidence, github: { runId: 42 }, effects: [{ secret: 'hidden' }],
  });
  assert.equal(output.schemaVersion, 'buildr.long-running-operation-summary/v1');
  assert.equal(output.resultIdentity, evidence.identity);
  assert.deepEqual(output.recovery, { owner: 'release-transaction-evidence', operation: 'inspect-run', taskId: 'release-task', runId: '42', recordId: null });
  assert.equal(JSON.stringify(output).includes('effects'), false);

  const inspected: any = compactReleaseTransactionInspect({ status: 'passed', runId: 42, evidenceIdentity: evidence.identity, evidence });
  assert.equal(inspected.resultIdentity, evidence.identity);
  assert.equal(inspected.stages[0].id, 'npm');
  assert.equal(Object.hasOwn(inspected, 'evidence'), false);
});
