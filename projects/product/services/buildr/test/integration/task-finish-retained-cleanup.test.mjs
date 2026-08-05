import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createFinishRun,
  finishRunFile,
  writeFinishCompletion,
} from '../../src/application/task-finish/task-finish-run.mjs';
import { executeRetainedTaskFinishCleanup } from '../../src/interfaces/internal/task-finish-retained-cleanup.mjs';

function readyRun(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-retained-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = createFinishRun({
    root,
    runId: 'retained-cleanup',
    identity: {
      task: 'finish-task',
      handoffIdentity: 'sha256-handoff',
      candidateIdentity: 'sha256-candidate',
      candidateGeneration: 1,
      contentTargetIdentity: 'sha256-content-target',
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      environmentRoot: path.join(root, '.worktrees', 'finish-task'),
      workspaceRoot: root,
      workspaceNodeIdentity: 'sha256-workspace-node',
    },
  });
  run.deliveryCarrier = { identity: 'sha256-carrier', head: 'carrier-ref' };
  run.delivery = { status: 'delivered', carrierRef: 'carrier-ref', remoteAfterRef: 'carrier-ref', finalRemoteRef: 'carrier-ref' };
  run.phases.find((phase) => phase.id === 'deliver').status = 'passed';
  run.phases.find((phase) => phase.id === 'cleanup').status = 'running';
  fs.writeFileSync(finishRunFile(root, run.runId), `${JSON.stringify(run, null, 2)}\n`);
  writeFinishCompletion({
    root,
    runId: run.runId,
    completion: {
      schemaVersion: 'buildr.task-finish-completion/v1',
      runId: run.runId,
      task: run.identity.task,
      handoffIdentity: run.identity.handoffIdentity,
      candidateIdentity: run.identity.candidateIdentity,
      candidateGeneration: run.identity.candidateGeneration,
      contentTargetIdentity: run.identity.contentTargetIdentity,
      carrierIdentity: run.deliveryCarrier.identity,
      carrierRef: run.deliveryCarrier.head,
      targetBranch: run.identity.targetBranch,
      status: 'prepared',
      preparedAt: new Date().toISOString(),
    },
  });
  return { root, run };
}

test('retained cleanup bootstrap derives Environment authorization from durable Finish facts', async (t) => {
  const { root, run } = readyRun(t);
  let authorization = null;
  const runtime = {
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      workspaceRoot: root,
      environmentRoot: run.identity.environmentRoot,
      repositories: [{ selector: 'workspace', startPoint: 'dev' }, { selector: 'product/buildr', startPoint: 'dev' }],
    }),
    cleanupTaskEnvironment: async (workspaceRoot, task, value) => {
      assert.equal(workspaceRoot, fs.realpathSync(root));
      assert.equal(task, run.identity.task);
      authorization = value;
      return { status: 'cleaned', effects: [], diagnostic: null };
    },
  };
  const result = await executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime });
  assert.equal(result.status, 'cleaned');
  assert.deepEqual(authorization, {
    type: 'finish',
    deliveries: { workspace: 'dev', 'product/buildr': 'dev' },
    candidateRef: 'carrier-ref',
    integratedContributions: { workspace: run.deliveryCarrier },
  });
});

test('retained cleanup bootstrap rejects an unprepared Finish run', async (t) => {
  const { root, run } = readyRun(t);
  run.phases.find((phase) => phase.id === 'deliver').status = 'pending';
  fs.writeFileSync(finishRunFile(root, run.runId), `${JSON.stringify(run, null, 2)}\n`);
  await assert.rejects(
    executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime: {} }),
    (error) => error.code === 'task-finish.retained-cleanup-run-not-ready',
  );
});
