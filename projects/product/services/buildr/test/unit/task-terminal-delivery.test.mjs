import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerTaskTerminalDeliveryApplication } from '../../src/application/task-terminal-delivery/task-terminal-delivery-application.mjs';
import { FINISH_PHASES, FINISH_RUN_SCHEMA, readTaskFinishResults } from '../../src/application/task-finish/task-finish-run.mjs';

const TASK = 'terminal-task';
const ids = {
  handoff: 'sha256-handoff', candidate: 'sha256-candidate', target: 'sha256-target', carrier: 'sha256-carrier', result: 'sha256-result', plan: 'sha256-plan',
};

function cleanup() {
  return { operation: 'cleanup', status: 'cleaned', taskId: TASK, environment: { status: 'cleaned', latest: { cleanup: { status: 'cleaned', completedAt: '2026-08-05T00:00:05.000Z', summary: '已清理。' } } } };
}

function finishEntry(overrides = {}) {
  const result = {
    runId: `${TASK}-run`, status: 'complete', completedAt: '2026-08-05T00:00:06.000Z', reuseMode: 'deterministic-reuse',
    identity: { task: TASK, handoffIdentity: ids.handoff, candidateIdentity: ids.candidate, candidateGeneration: 1, contentTargetIdentity: ids.target, targetBranch: 'dev', remote: 'origin' },
    handoff: { identity: ids.handoff }, candidate: { identity: ids.candidate, generation: 1, contentTargetIdentity: ids.target },
    carrier: { identity: ids.carrier },
    equivalence: { status: 'equivalent', reuseMode: 'deterministic-reuse', semanticEquivalence: 'deterministic-git-identity', handoffIdentity: ids.handoff, candidateIdentity: ids.candidate, candidateGeneration: 1, contentTargetIdentity: ids.target, carrierIdentity: ids.carrier },
    delivery: { status: 'delivered', carrierRef: 'abc123', remoteAfterRef: 'abc123', finalRemoteRef: 'abc123', activation: { status: 'passed' }, retainedDoctor: 'passed', runtimeInstall: 'passed', localAppDelivery: { status: 'passed', channel: 'development' } },
    completion: { status: 'complete', cleanup: cleanup() },
    ...overrides,
  };
  return { result, completion: { task: TASK, handoffIdentity: ids.handoff, candidateIdentity: ids.candidate, candidateGeneration: 1, contentTargetIdentity: ids.target, carrierIdentity: ids.carrier, carrierRef: 'abc123' } };
}

function handoff() {
  return {
    identity: ids.handoff,
    candidate: { identity: ids.candidate, generation: 1, contentTargetIdentity: ids.target, taskContextIdentity: 'sha256-context', policyIdentity: 'sha256-policy' },
    gates: {
      planning: { disposition: 'not-applicable', targetIdentity: ids.plan, summary: '无需独立方案审查。', source: 'change guard' },
      verification: { resultDigest: ids.result, targetIdentity: ids.target, outcome: 'passed', applicability: 'current' },
      completion: { resultDigest: 'sha256-completion-result', targetIdentity: ids.candidate, outcome: 'ready', applicability: 'current' },
    },
    decision: { outcome: 'proceed', risks: [] },
  };
}

function runtimeFor(status = 'completed', finish = finishEntry()) {
  const immutable = handoff();
  const receipt = { taskContext: { identity: 'sha256-context' }, planning: { identity: ids.plan, nodes: [] }, contentTarget: { identity: ids.target }, verificationPolicy: { identity: 'sha256-policy' }, candidate: immutable.candidate, handoffs: [immutable] };
  const runtime = {
    inspectTaskRecord: () => ({ record: { taskId: TASK, status, result: status === 'completed' ? { noChange: false } : null } }),
    inspectTaskDevelopment: () => ({ operation: 'inspect', status: 'inspected', development: { receipt } }),
    inspectTaskReview: () => ({ slots: {
      planning: { present: false, result: null, resultDigest: null, applicability: null },
      completion: { present: true, resultDigest: 'sha256-completion-result', applicability: 'unknown', result: { targetIdentity: ids.candidate, conclusion: { outcome: 'ready' } } },
    } }),
    inspectTaskVerification: () => ({ slot: { present: true, resultDigest: ids.result, applicability: { status: 'unknown' }, result: { target: { identity: ids.target }, conclusion: { outcome: 'passed' } } } }),
    readTaskFinishResults: () => ({ results: finish ? [finish] : [], diagnostics: [] }),
  };
  registerTaskTerminalDeliveryApplication(runtime);
  return runtime;
}

test('terminal composer separates delivered snapshot from live applicability', () => {
  const projection = runtimeFor().inspectTaskTerminalDelivery('/workspace', TASK);
  assert.equal(projection.status, 'delivered');
  assert.equal(projection.delivered, true);
  assert.equal(projection.delivery.finalRemoteRef, 'abc123');
  assert.equal(projection.associations.planning.status, 'gate-disposition');
  assert.equal(projection.associations.completion.status, 'adopted-at-delivery');
  assert.equal(projection.associations.verification.status, 'verified-at-delivery');
  assert.equal(projection.reviews.slots.completion.applicability, 'unknown');
});

test('terminal composer covers active, no-change, abandoned, unproven and identity mismatch', () => {
  assert.equal(runtimeFor('active').inspectTaskTerminalDelivery('/workspace', TASK).status, 'active');
  const noChange = runtimeFor(); noChange.inspectTaskRecord = () => ({ record: { taskId: TASK, status: 'completed', result: { noChange: true } } });
  assert.equal(noChange.inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed-no-change');
  assert.equal(runtimeFor('abandoned').inspectTaskTerminalDelivery('/workspace', TASK).status, 'abandoned');
  assert.equal(runtimeFor('completed', null).inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed-unproven');
  for (const field of ['task', 'handoff', 'candidate', 'generation', 'target']) {
    const mismatch = finishEntry();
    if (field === 'task') {
      mismatch.result.identity.task = 'other-task';
      mismatch.completion.task = 'other-task';
    }
    if (field === 'handoff') {
      mismatch.result.identity.handoffIdentity = 'sha256-other';
      mismatch.result.handoff.identity = 'sha256-other';
      mismatch.result.equivalence.handoffIdentity = 'sha256-other';
      mismatch.completion.handoffIdentity = 'sha256-other';
    }
    if (field === 'candidate') {
      mismatch.result.identity.candidateIdentity = 'sha256-other';
      mismatch.result.candidate.identity = 'sha256-other';
      mismatch.result.equivalence.candidateIdentity = 'sha256-other';
      mismatch.completion.candidateIdentity = 'sha256-other';
    }
    if (field === 'generation') {
      mismatch.result.identity.candidateGeneration = 2;
      mismatch.result.candidate.generation = 2;
      mismatch.result.equivalence.candidateGeneration = 2;
      mismatch.completion.candidateGeneration = 2;
    }
    if (field === 'target') {
      mismatch.result.identity.contentTargetIdentity = 'sha256-other';
      mismatch.result.candidate.contentTargetIdentity = 'sha256-other';
      mismatch.result.equivalence.contentTargetIdentity = 'sha256-other';
      mismatch.completion.contentTargetIdentity = 'sha256-other';
    }
    assert.equal(runtimeFor('completed', mismatch).inspectTaskTerminalDelivery('/workspace', TASK).status, 'completed-unproven', field);
  }

  const unavailable = runtimeFor('completed', null);
  unavailable.readTaskFinishResults = () => ({ results: [], diagnostics: [{ code: 'task_finish_completion_invalid' }] });
  assert.equal(unavailable.inspectTaskTerminalDelivery('/workspace', TASK).status, 'unavailable');
});

test('Finish query reads current JSON authority, prefers valid completion and reports matching corruption', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-terminal-finish-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runs = path.join(root, '.buildr', 'task-finish', 'runs');
  const completed = path.join(root, '.buildr', 'task-finish', 'completed');
  fs.mkdirSync(runs, { recursive: true }); fs.mkdirSync(completed, { recursive: true });
  const runId = `${TASK}-run`;
  const entry = finishEntry();
  const run = {
    schemaVersion: FINISH_RUN_SCHEMA, runId, status: 'complete',
    identity: { task: TASK, handoffIdentity: ids.handoff, candidateIdentity: ids.candidate, candidateGeneration: 1, contentTargetIdentity: ids.target, agent: 'codex', targetBranch: 'dev', remote: 'origin', environmentRoot: root, workspaceRoot: root, workspaceNodeIdentity: 'sha256-node' },
    identityDigest: 'sha256-identity', createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:06.000Z', completedAt: '2026-08-05T00:00:06.000Z', invocations: 1,
    deliveryCarrier: entry.result.carrier, equivalence: entry.result.equivalence, delivery: entry.result.delivery, completion: entry.result.completion, resume: null, primaryFailure: null,
    phases: FINISH_PHASES.map((id) => ({ id, status: 'passed', attempts: 1, startedAt: null, completedAt: null, durationMs: 0, inputIdentity: null, outputIdentity: null, checks: [], operations: [], observations: [], output: null, failure: null })),
  };
  fs.writeFileSync(path.join(runs, `${runId}.json`), `${JSON.stringify(run)}\n`);
  fs.writeFileSync(path.join(completed, `${runId}.json`), `${JSON.stringify({ schemaVersion: 'buildr.task-finish-completion/v1', runId, task: TASK, handoffIdentity: ids.handoff, candidateIdentity: ids.candidate, candidateGeneration: 1, contentTargetIdentity: ids.target, carrierIdentity: ids.carrier, carrierRef: 'abc123', status: 'complete', completedAt: run.completedAt })}\n`);
  fs.writeFileSync(path.join(runs, `${TASK}-old-failed.json`), `${JSON.stringify({ schemaVersion: FINISH_RUN_SCHEMA, runId: `${TASK}-old-failed`, status: 'blocked', identity: { task: TASK } })}\n`);
  fs.writeFileSync(path.join(completed, `${TASK}-broken.json`), '{broken');
  const query = readTaskFinishResults({ root, taskId: TASK, clock: () => Date.parse(run.completedAt) });
  assert.equal(query.results.length, 1);
  assert.equal(query.results[0].result.runId, runId);
  assert.equal(query.diagnostics[0].code, 'task_finish_completion_invalid');
});
