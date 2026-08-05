import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after, before } from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { taskDevelopmentDigest } from '../../src/domain/task-development/task-development.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
let fixtureTemplateBase;
let fixtureTemplateRoot;

function run(args) {
  const result = spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}

function writeVerificationDeclaration(root) {
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
}

before(() => {
  fixtureTemplateBase = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-development-template-'));
  fixtureTemplateRoot = path.join(fixtureTemplateBase, 'workspace');
  run(['init', '--target', fixtureTemplateRoot, '--name', 'development-fixture', '--description', 'Task Development integration fixture']);
  run(['project', 'create', 'demo', '--target', fixtureTemplateRoot, '--name', 'Demo', '--description', 'Demo project']);
  fs.writeFileSync(path.join(fixtureTemplateRoot, 'projects', 'demo', 'README.md'), '# Demo\n');
  writeVerificationDeclaration(fixtureTemplateRoot);
});

after(() => {
  if (fixtureTemplateBase) fs.rmSync(fixtureTemplateBase, { recursive: true, force: true });
});

function copyFixtureWorkspace(t, name) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-task-development-${name}-`));
  const root = path.join(base, 'workspace');
  fs.cpSync(fixtureTemplateRoot, root, { recursive: true });
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return { base, root };
}

function pinImmutableTaskRecord(runtime, root, taskId) {
  const readTaskRecordPersistence = runtime.readTaskRecordPersistence;
  let taskRecord;
  runtime.readTaskRecordPersistence = (targetRoot, currentTaskId, ...args) => {
    if (targetRoot !== root || currentTaskId !== taskId) return readTaskRecordPersistence(targetRoot, currentTaskId, ...args);
    taskRecord ||= readTaskRecordPersistence(targetRoot, currentTaskId, ...args);
    return taskRecord;
  };
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function fixture(t, taskId) {
  const { root } = copyFixtureWorkspace(t, 'application');
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId, title: 'Develop demo', intent: 'Deliver current demo content.', projects: ['demo'], services: [], changes: [] });
  runtime.resolveTaskEnvironmentExecution = (_workspace, currentTask) => ({
    ready: true,
    taskId: currentTask,
    receiptSchema: 'buildr.task-environment-receipt/v2',
    workspaceRoot: root,
    environmentRoot: root,
    validationRoot: root,
    scopes: [{ selector: 'project:demo', kind: 'project', sourcePath: 'projects/demo', executionRoot: path.join(root, 'projects', 'demo') }],
  });
  pinImmutableTaskRecord(runtime, root, taskId);
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

function gitDevelopmentFixture(t, taskId, { sharedPath = false } = {}) {
  const { root } = copyFixtureWorkspace(t, 'git');
  const taskRoot = path.join(root, '.worktrees', taskId);
  if (sharedPath) fs.writeFileSync(path.join(root, 'shared.txt'), `${Array.from({ length: 40 }, (_, index) => `line-${index + 1}`).join('\n')}\n`);
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Development']);
  git(root, ['config', 'user.email', 'development@example.com']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'baseline']);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId, title: 'Develop Git demo', intent: 'Preserve contribution applicability across baseline advance.', projects: ['demo'], services: [], changes: [] });
  fs.mkdirSync(path.dirname(taskRoot), { recursive: true });
  git(root, ['worktree', 'add', '-b', `codex/${taskId}`, taskRoot, 'dev']);
  git(taskRoot, ['config', 'user.name', 'Buildr Development']);
  git(taskRoot, ['config', 'user.email', 'development@example.com']);
  if (sharedPath) {
    const lines = fs.readFileSync(path.join(taskRoot, 'shared.txt'), 'utf8').trimEnd().split('\n');
    lines[39] = 'task-line-40';
    fs.writeFileSync(path.join(taskRoot, 'shared.txt'), `${lines.join('\n')}\n`);
  } else {
    fs.writeFileSync(path.join(taskRoot, 'feature.txt'), 'task contribution\n');
  }
  git(taskRoot, ['add', '-A']);
  git(taskRoot, ['commit', '-m', 'task contribution']);
  runtime.resolveTaskEnvironmentExecution = () => ({
    ready: true,
    taskId,
    receiptSchema: 'buildr.task-environment-receipt/v2',
    workspaceRoot: root,
    environmentRoot: taskRoot,
    validationRoot: taskRoot,
    repositories: [{ selector: 'workspace', sourceRepository: root, checkoutPath: taskRoot }],
    scopes: [
      { selector: 'workspace', kind: 'workspace', sourcePath: '.', executionRoot: taskRoot },
      { selector: 'project:demo', kind: 'project', sourcePath: 'projects/demo', executionRoot: path.join(taskRoot, 'projects', 'demo') },
    ],
  });
  const planningTargetIdentity = taskDevelopmentDigest(`${taskId}:plan`);
  runtime.recordTaskReview(root, taskId, { reviewType: 'planning', targetIdentity: planningTargetIdentity, method: 'self', reviewed: ['Git-backed plan'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Ready.' } });
  let result = runtime.observeTaskDevelopment(root, taskId, { changeDispositions: [], planningTargetIdentity });
  runtime.recordTaskDevelopmentPolicy(root, taskId, { capabilities: [{ project: 'demo', capability: 'demo.check', required: true }], coverageGaps: [], overrides: [] });
  const targetIdentity = result.development.receipt.contentTarget.identity;
  runtime.recordTaskVerification(root, taskId, {
    targetIdentity, targetSummary: 'Git Task Contribution target', capabilities: [{ project: 'demo', capability: 'demo.check', outcome: 'passed', facts: ['Demo check passed.'] }],
    coverageGaps: [], conclusion: { outcome: 'passed', summary: 'Verified.' }, declarationRoot: taskRoot,
  });
  result = runtime.freezeTaskDevelopmentCandidate(root, taskId);
  const candidate = result.development.receipt.candidate;
  runtime.recordTaskReview(root, taskId, { reviewType: 'completion', targetIdentity: candidate.identity, method: 'self', reviewed: ['Git Task Candidate'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Ready.' } });
  runtime.decideTaskDevelopment(root, taskId, { outcome: 'proceed', summary: 'Current positive gates.', risks: [] });
  result = runtime.createTaskDevelopmentHandoff(root, taskId);
  return { root, taskRoot, runtime, taskId, planningTargetIdentity, candidate, handoff: result.development.receipt.handoffs.at(-1), targetIdentity };
}

test('从proposal建立planning Receipt，并以明确waiver完成可选Verification与Completion gate', (t) => {
  const current = fixture(t, 'planning-first');
  const opened = current.runtime.openWorkspaceStructuredStore(current.root, { writable: true });
  opened.database.prepare('DELETE FROM task_development_current WHERE task_id = ?').run(current.taskId);
  opened.database.close();
  let result = current.runtime.beginTaskDevelopment(current.root, current.taskId, {
    changeDispositions: [],
    planning: { targetIdentity: current.planningTargetIdentity, nodes: [{ id: 'proposal', kind: 'proposal', authority: 'openspec/v1', reference: 'demo/change/proposal', identity: taskDevelopmentDigest('proposal-v1'), disposition: 'current', summary: 'Proposal current.' }] },
  });
  assert.equal(result.status, 'created');
  assert.equal(result.development.applicability.status, 'planning');
  assert.equal(result.development.applicability.contentTarget, 'missing');
  assert.equal(result.development.receipt.contentTarget, null);
  assert.equal(result.development.receipt.gates.planning.outcome, 'ready');

  result = current.runtime.observeTaskDevelopment(current.root, current.taskId, { changeDispositions: [], planningTargetIdentity: current.planningTargetIdentity });
  assert.ok(result.development.receipt.contentTarget);
  result = current.runtime.recordTaskDevelopmentPolicy(current.root, current.taskId, { capabilities: [{ project: 'demo', capability: 'demo.check', required: true }], coverageGaps: [], overrides: [] });
  const targetIdentity = result.development.receipt.contentTarget.identity;
  current.runtime.recordTaskDevelopmentGate(current.root, current.taskId, { gate: 'verification', disposition: 'waived', targetIdentity, summary: 'User explicitly waived formal execution for this fixture.', source: 'user:integration-fixture' });
  result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  assert.equal(result.status, 'frozen');
  const candidate = result.development.receipt.candidate;
  current.runtime.recordTaskDevelopmentGate(current.root, current.taskId, { gate: 'completion', disposition: 'waived', targetIdentity: candidate.identity, summary: 'User explicitly waived Completion Review for this fixture.', source: 'user:integration-fixture' });
  result = current.runtime.decideTaskDevelopment(current.root, current.taskId, { outcome: 'proceed', summary: 'Explicit optional-node waivers are current.', risks: [] });
  assert.equal(result.development.receipt.decision.outcome, 'proceed');
  result = current.runtime.createTaskDevelopmentHandoff(current.root, current.taskId);
  assert.equal(result.status, 'ready');
  assert.equal(result.development.receipt.handoffs[0].gates.verification.disposition, 'waived');

  const firstCandidate = result.development.receipt.candidate;
  const firstHandoff = result.development.receipt.handoffs[0];
  const nextPlanningTarget = taskDevelopmentDigest('planning-first:plan-v2');
  result = current.runtime.recordTaskDevelopmentPlanning(current.root, current.taskId, {
    changeDispositions: [],
    planning: { targetIdentity: nextPlanningTarget, nodes: [{ id: 'proposal', kind: 'proposal', authority: 'openspec/v1', reference: 'demo/change/proposal', identity: taskDevelopmentDigest('proposal-v2'), disposition: 'current', summary: 'Proposal updated.' }] },
    planningGate: { disposition: 'waived', targetIdentity: nextPlanningTarget, summary: 'The user explicitly accepted the updated plan without another review.', source: 'user:integration-fixture' },
  });
  assert.equal(result.development.receipt.candidate, null);
  assert.deepEqual(result.development.receipt.handoffs, [firstHandoff]);
  result = current.runtime.observeTaskDevelopment(current.root, current.taskId, { changeDispositions: [], planningTargetIdentity: nextPlanningTarget });
  result = current.runtime.recordTaskDevelopmentPolicy(current.root, current.taskId, { capabilities: [{ project: 'demo', capability: 'demo.check', required: true }], coverageGaps: [], overrides: [] });
  current.runtime.recordTaskDevelopmentGate(current.root, current.taskId, { gate: 'verification', disposition: 'waived', targetIdentity: result.development.receipt.contentTarget.identity, summary: 'User explicitly waived repeated formal execution for this fixture.', source: 'user:integration-fixture' });
  result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  assert.equal(result.development.receipt.candidate.generation, firstCandidate.generation + 1);
  assert.notEqual(result.development.receipt.candidate.identity, firstCandidate.identity);
  assert.deepEqual(result.development.receipt.handoffs, [firstHandoff]);
});

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

test('Delivery Baseline 前进保持 current；只有原 Task source 变化使 Development stale', (t) => {
  const shared = gitDevelopmentFixture(t, 'baseline-applicability-shared', { sharedPath: true });
  fs.writeFileSync(path.join(shared.root, 'baseline-advance.txt'), 'independent baseline advance\n');
  git(shared.root, ['add', 'baseline-advance.txt']);
  git(shared.root, ['commit', '-m', 'advance delivery baseline']);

  let result = shared.runtime.inspectTaskDevelopment(shared.root, shared.taskId);
  assert.equal(result.development.applicability.contentTarget, 'current');
  assert.equal(result.development.applicability.candidate, 'current');
  assert.equal(result.development.applicability.handoff, 'current');
  assert.deepEqual(result.development.applicability.gates, {
    planning: { ...result.development.receipt.gates.planning, applicability: 'current' },
    verification: { ...result.development.receipt.gates.verification, applicability: 'current' },
    completion: { ...result.development.receipt.gates.completion, applicability: 'current' },
  });
  result = shared.runtime.freezeTaskDevelopmentCandidate(shared.root, shared.taskId);
  assert.equal(result.status, 'unchanged');
  assert.equal(result.development.receipt.candidate.generation, 1);

  const taskSource = fs.readFileSync(path.join(shared.taskRoot, 'shared.txt'));
  fs.appendFileSync(path.join(shared.taskRoot, 'shared.txt'), 'changed contribution\n');
  result = shared.runtime.inspectTaskDevelopment(shared.root, shared.taskId);
  assert.equal(result.development.applicability.contentTarget, 'stale');
  assert.equal(result.development.applicability.candidate, 'stale');
  assert.equal(result.development.applicability.handoff, 'stale');

  fs.writeFileSync(path.join(shared.taskRoot, 'shared.txt'), taskSource);
  result = shared.runtime.inspectTaskDevelopment(shared.root, shared.taskId);
  assert.equal(result.development.applicability.contentTarget, 'current');
  assert.equal(result.development.applicability.handoff, 'current');

  const baselineLines = fs.readFileSync(path.join(shared.root, 'shared.txt'), 'utf8').trimEnd().split('\n');
  baselineLines[0] = 'baseline-line-1';
  fs.writeFileSync(path.join(shared.root, 'shared.txt'), `${baselineLines.join('\n')}\n`);
  git(shared.root, ['add', 'shared.txt']);
  git(shared.root, ['commit', '-m', 'advance shared baseline']);
  result = shared.runtime.inspectTaskDevelopment(shared.root, shared.taskId);
  assert.equal(result.development.applicability.contentTarget, 'current');
  assert.equal(result.development.applicability.handoff, 'current');

  shared.runtime.resolveTaskEnvironmentExecution = () => ({
    ready: true, taskId: shared.taskId, receiptSchema: 'buildr.task-environment-receipt/v2', workspaceRoot: shared.root,
    environmentRoot: shared.taskRoot, validationRoot: shared.taskRoot, repositories: [],
    scopes: [
      { selector: 'workspace', kind: 'workspace', sourcePath: '.', executionRoot: shared.taskRoot },
      { selector: 'project:demo', kind: 'project', sourcePath: 'projects/demo', executionRoot: path.join(shared.taskRoot, 'projects', 'demo') },
    ],
  });
  result = shared.runtime.inspectTaskDevelopment(shared.root, shared.taskId);
  assert.equal(result.development.applicability.contentTarget, 'current');
  assert.equal(result.development.applicability.handoff, 'current');

  shared.runtime.resolveTaskEnvironmentExecution = () => ({
    ready: true, taskId: shared.taskId, receiptSchema: 'buildr.task-environment-receipt/v2', workspaceRoot: shared.root,
    environmentRoot: shared.taskRoot, validationRoot: shared.taskRoot,
    repositories: [{ selector: 'workspace', sourceRepository: path.join(shared.root, 'missing-retained-repository'), checkoutPath: shared.taskRoot }],
    scopes: [
      { selector: 'workspace', kind: 'workspace', sourcePath: '.', executionRoot: shared.taskRoot },
      { selector: 'project:demo', kind: 'project', sourcePath: 'projects/demo', executionRoot: path.join(shared.taskRoot, 'projects', 'demo') },
    ],
  });
  result = shared.runtime.inspectTaskDevelopment(shared.root, shared.taskId);
  assert.equal(result.development.applicability.contentTarget, 'current');
  assert.equal(result.development.applicability.handoff, 'current');
});
