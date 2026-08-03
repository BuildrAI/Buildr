import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { taskDevelopmentDigest } from '../../src/domain/task-development/task-development.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

function run(args) {
  const result = spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}

function fixture(t, taskId) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-development-application-'));
  const root = path.join(base, 'workspace');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  run(['init', '--target', root, '--name', 'development-fixture', '--description', 'Task Development integration fixture']);
  run(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo project']);
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'README.md'), '# Demo\n');
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v2',
    resources: [],
    capabilities: [{
      id: 'demo.check', title: 'Demo check', scope: { project: 'demo', services: [] },
      invocation: { kind: 'command', argv: ['sh', '-c', 'test -s README.md'], cwd: '.' },
      applicability: { paths: ['**'], conditions: [] }, proves: ['Demo content is readable.'], requiredForDelivery: true,
      environment: { requires: ['sh'] }, effects: { writes: [], externalSystems: [], authorization: 'implicit' }, resourceClaims: [],
    }],
  }));
  run(['task', 'create', taskId, '--title', 'Develop demo', '--intent', 'Deliver current demo content.', '--project', 'demo', '--target', root]);
  const runtime = createRuntime();
  runtime.resolveTaskEnvironmentExecution = (_workspace, currentTask) => ({
    ready: true,
    taskId: currentTask,
    receiptSchema: 'buildr.task-environment-receipt/v2',
    workspaceRoot: root,
    environmentRoot: root,
    validationRoot: root,
    scopes: [{ selector: 'project:demo', kind: 'project', sourcePath: 'projects/demo', executionRoot: path.join(root, 'projects', 'demo') }],
  });
  const planningTargetIdentity = taskDevelopmentDigest(`${taskId}:plan`);
  runtime.recordTaskReview(root, taskId, { reviewType: 'planning', targetIdentity: planningTargetIdentity, method: 'self', reviewed: ['Task plan'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Ready.' } });
  runtime.observeTaskDevelopment(root, taskId, { changeDispositions: [], planningTargetIdentity });
  const policy = runtime.recordTaskDevelopmentPolicy(root, taskId, { capabilities: [{ project: 'demo', capability: 'demo.check', required: true }], coverageGaps: [], overrides: [] });
  return { root, runtime, taskId, planningTargetIdentity, targetIdentity: policy.development.receipt.contentTarget.identity };
}

function recordVerification(current, outcome = 'passed') {
  return current.runtime.recordTaskVerification(current.root, current.taskId, {
    targetIdentity: current.targetIdentity,
    targetSummary: 'Demo Content Target',
    capabilities: [{ project: 'demo', capability: 'demo.check', outcome: outcome === 'passed' ? 'passed' : 'failed', facts: [outcome === 'passed' ? 'Demo check passed.' : 'Demo check failed.'] }],
    coverageGaps: [],
    conclusion: { outcome, summary: outcome === 'passed' ? 'Verified.' : 'Verification found a known failure.' },
    declarationRoot: current.root,
  });
}

function completion(current, candidate, outcome = 'ready') {
  return current.runtime.recordTaskReview(current.root, current.taskId, { reviewType: 'completion', targetIdentity: candidate.identity, method: 'self', reviewed: ['Task Candidate'], uncovered: [], findings: outcome === 'ready' ? [] : ['Known acceptance concern.'], conclusion: { outcome, summary: outcome === 'ready' ? 'Ready.' : 'Requires explicit risk acceptance.' } });
}

test('同一输入刷新 Result 不递增 generation；Content 变化递增且保留旧 handoff snapshot', (t) => {
  const current = fixture(t, 'generation-refresh');
  assert.throws(() => current.runtime.recordTaskDevelopmentPolicy(current.root, current.taskId, {
    capabilities: [{ project: 'demo', capability: 'demo.check', required: false }], coverageGaps: [], overrides: [],
  }), (error) => error.code === 'task_development_policy_override_required');
  let policy = current.runtime.recordTaskDevelopmentPolicy(current.root, current.taskId, {
    capabilities: [{ project: 'demo', capability: 'demo.check', required: false }],
    coverageGaps: [],
    overrides: [{ project: 'demo', capability: 'demo.check', required: false, scope: 'project:demo', basis: 'Task only needs advisory facts.', source: 'user:integration-fixture' }],
  });
  assert.equal(policy.development.receipt.verificationPolicy.overrides.length, 1);
  policy = current.runtime.recordTaskDevelopmentPolicy(current.root, current.taskId, {
    capabilities: [{ project: 'demo', capability: 'demo.check', required: true }], coverageGaps: [], overrides: [],
  });
  current.targetIdentity = policy.development.receipt.contentTarget.identity;
  const firstVerification = recordVerification(current);
  let result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  const first = result.development.receipt.candidate;
  assert.equal(first.generation, 1);

  const replacement = current.runtime.recordTaskVerification(current.root, current.taskId, {
    targetIdentity: current.targetIdentity,
    targetSummary: 'Demo Content Target',
    capabilities: [{ project: 'demo', capability: 'demo.check', outcome: 'passed', facts: ['Replacement facts remain applicable.'] }],
    coverageGaps: [], conclusion: { outcome: 'passed', summary: 'Replacement Result passed.' }, declarationRoot: current.root,
  });
  assert.notEqual(replacement.slot.resultDigest, firstVerification.slot.resultDigest);
  result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  assert.equal(result.status, 'unchanged');
  assert.equal(result.development.receipt.candidate.identity, first.identity);
  assert.equal(result.development.receipt.generation, 1);

  completion(current, first);
  current.runtime.decideTaskDevelopment(current.root, current.taskId, { outcome: 'proceed', summary: 'Current positive gates.', risks: [] });
  result = current.runtime.createTaskDevelopmentHandoff(current.root, current.taskId);
  const snapshot = result.development.receipt.handoffs[0];

  fs.appendFileSync(path.join(current.root, 'projects', 'demo', 'README.md'), 'Changed content.\n');
  result = current.runtime.observeTaskDevelopment(current.root, current.taskId, { changeDispositions: [], planningTargetIdentity: current.planningTargetIdentity });
  assert.equal(result.development.receipt.candidate, null);
  assert.deepEqual(result.development.receipt.handoffs, [snapshot]);
  current.targetIdentity = result.development.receipt.contentTarget.identity;
  recordVerification(current);
  result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  assert.equal(result.development.receipt.generation, 2);
  assert.notEqual(result.development.receipt.candidate.identity, first.identity);
  assert.deepEqual(result.development.receipt.handoffs, [snapshot]);
});

test('Verification not-passed 与 Completion changes-required 可经精确用户风险接受形成 handoff', (t) => {
  const current = fixture(t, 'risk-acceptance');
  const verification = recordVerification(current, 'not-passed');
  let result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  const candidate = result.development.receipt.candidate;
  const review = completion(current, candidate, 'changes-required');
  assert.throws(() => current.runtime.decideTaskDevelopment(current.root, current.taskId, { outcome: 'proceed', summary: 'Missing risk acceptance.', risks: [] }), (error) => error.code === 'task_development_risk_acceptance_required');
  assert.throws(() => current.runtime.decideTaskDevelopment(current.root, current.taskId, {
    outcome: 'proceed', summary: 'Contains a stale risk reference.', risks: [
      { gate: 'verification', resultDigest: verification.slot.resultDigest, scope: 'project:demo', summary: 'Known demo check failure.', source: 'user:integration-fixture' },
      { gate: 'completion', resultDigest: taskDevelopmentDigest('stale-completion'), scope: 'project:demo', summary: 'Stale completion concern.', source: 'user:integration-fixture' },
    ],
  }), (error) => error.code === 'task_development_risk_result_mismatch');
  result = current.runtime.decideTaskDevelopment(current.root, current.taskId, {
    outcome: 'proceed',
    summary: 'User accepts the bounded documentation risk.',
    risks: [
      { gate: 'verification', resultDigest: verification.slot.resultDigest, scope: 'project:demo', summary: 'Known demo check failure accepted for this Candidate.', source: 'user:integration-fixture' },
      { gate: 'completion', resultDigest: review.slots.completion.resultDigest, scope: 'project:demo', summary: 'Known completion concern accepted for this Candidate.', source: 'user:integration-fixture' },
    ],
  });
  assert.equal(result.development.receipt.decision.candidateIdentity, candidate.identity);
  result = current.runtime.createTaskDevelopmentHandoff(current.root, current.taskId);
  assert.equal(result.development.receipt.handoffs[0].candidate.identity, candidate.identity);
  assert.equal(result.development.receipt.handoffs[0].decision.risks.length, 2);
});
