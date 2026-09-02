// @ts-nocheck -- Existing behavioral suite migrated with its implementation; typing the fixture framework is outside this change.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

import { createBuildrContextTest } from '../context/buildr-node-test.mjs';
import { taskDevelopmentDigest } from '../../src/task/domain/task-development.mjs';
import { BUILDR_TASK_TEST_CONTEXTS } from '../context/providers/task-application.mjs';
import { recordVerificationResultFromEvidence } from '../helpers/task-verification-result-fixture.mjs';

const SHARD_COUNT = 4;
const shardValue = process.env.BUILDR_TASK_DEVELOPMENT_TEST_SHARD ?? '0';
const shardIndex = Number.parseInt(shardValue, 10);
if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= SHARD_COUNT || String(shardIndex) !== shardValue) {
  throw new Error(`Invalid BUILDR_TASK_DEVELOPMENT_TEST_SHARD: ${shardValue}`);
}
const test = createBuildrContextTest({
  suiteId: `task-development-application-shard-${shardIndex}`,
  contexts: BUILDR_TASK_TEST_CONTEXTS,
  select: (index) => index % SHARD_COUNT === shardIndex,
});

function writeVerificationDeclaration(root) {
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v4',
    testing: [{
      id: 'demo.check', title: 'Demo check', scope: { project: 'demo', services: [] },
      purpose: 'Demo content is readable.', sourcePaths: ['**'], testRoots: ['test/**'],
      full: { kind: 'command', argv: ['sh', '-c', 'test -s README.md'], cwd: '.' }, requirements: ['sh'],
    }],
  }));
}

function copyFixtureWorkspace(t, name) {
  const { base, root } = t.buildrContexts.workspace;
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'README.md'), '# Demo\n');
  writeVerificationDeclaration(root);
  fs.writeFileSync(path.join(root, 'projects', 'other', 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v4', testing: [],
  }));
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
  const runtime = t.buildrContexts.application;
  runtime.createTaskRecord(root, { taskId, title: 'Develop demo', intent: 'Deliver current demo content.', projects: ['demo'], services: [], changes: [] });
  runtime.resolveTaskEnvironmentExecution = (_workspace, currentTask) => ({
    ready: true,
    taskId: currentTask,
    receiptSchema: 'buildr.task-environment-receipt/v2',
    workspaceRoot: root,
    environmentRoot: root,
    validationRoot: root,
    controllerInvocation: { command: process.execPath, argsPrefix: ['/retained/buildr.mjs'], sourceRoot: '/retained/buildr', kind: 'stable-controller' },
    scopes: [{ selector: 'project:demo', kind: 'project', sourcePath: 'projects/demo', executionRoot: path.join(root, 'projects', 'demo') }],
  });
  pinImmutableTaskRecord(runtime, root, taskId);
  const planningTargetIdentity = taskDevelopmentDigest(`${taskId}:plan`);
  runtime.recordTaskReview(root, taskId, { reviewType: 'planning', targetIdentity: planningTargetIdentity, method: 'self', reviewed: ['Task plan'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Ready.' } });
  const observed = runtime.observeTaskDevelopment(root, taskId, { changeDispositions: [], planningTargetIdentity });
  return { root, runtime, taskId, planningTargetIdentity, targetIdentity: observed.development.receipt.contentTarget.identity };
}

function changeFixture(t, taskId, initial = { availability: 'available', lifecycle: 'archived' }) {
  const { root } = copyFixtureWorkspace(t, 'change-convergence');
  const runtime = t.buildrContexts.application;
  let observed = { availability: 'available', lifecycle: 'archived' };
  runtime.resolveTaskScopedChange = (_workspace, currentTaskId, reference) => ({
    schemaVersion: 'buildr.task-scoped-change-reference/v1',
    taskId: currentTaskId,
    reference,
    availability: observed.availability,
    workingCopy: observed.availability === 'available' && observed.lifecycle
      ? { provenance: 'task-environment-candidate', root: path.join(root, 'projects', 'demo'), change: { lifecycle: observed.lifecycle } }
      : null,
    retainedBaseline: { provenance: 'retained-baseline', root: path.join(root, 'projects', 'demo'), change: { lifecycle: 'active' } },
    diagnostic: observed.availability === 'available' ? null : { code: 'task_change_unavailable', message: 'Resolver unavailable.' },
  });
  runtime.createTaskRecord(root, { taskId, title: 'Converge demo change', intent: 'Require observed Change convergence.', projects: ['demo'], services: [], changes: ['demo/convergence-guard'] });
  observed = initial;
  runtime.resolveTaskEnvironmentExecution = (_workspace, currentTask) => ({
    ready: true,
    taskId: currentTask,
    receiptSchema: 'buildr.task-environment-receipt/v2',
    workspaceRoot: root,
    environmentRoot: root,
    validationRoot: root,
    controllerInvocation: { command: process.execPath, argsPrefix: ['/retained/buildr.mjs'], sourceRoot: '/retained/buildr', kind: 'stable-controller' },
    scopes: [{ selector: 'project:demo', kind: 'project', sourcePath: 'projects/demo', executionRoot: path.join(root, 'projects', 'demo') }],
  });
  pinImmutableTaskRecord(runtime, root, taskId);
  const planningTargetIdentity = taskDevelopmentDigest(`${taskId}:plan`);
  runtime.recordTaskReview(root, taskId, { reviewType: 'planning', targetIdentity: planningTargetIdentity, method: 'self', reviewed: ['Change convergence guard'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Ready.' } });
  const dispositions = [{ project: 'demo', change: 'convergence-guard', disposition: 'converged', summary: 'Change converged.' }];
  return { root, runtime, taskId, planningTargetIdentity, dispositions, setObserved(value) { observed = value; } };
}

function recordKnowledge(current, status = 'aligned') {
  const receipt = current.runtime.inspectTaskDevelopment(current.root, current.taskId).development.receipt;
  return current.runtime.recordTaskDevelopmentKnowledge(current.root, current.taskId, {
    treeIdentity: receipt.contentTarget.identity,
    status,
    summary: status === 'blocked' ? 'Completion-critical knowledge conflict remains.' : 'Current knowledge is reconciled for this fixture.',
    sourceIdentities: ['test:task-development-application'],
    unresolvedItems: status === 'blocked' ? ['Resolve the completion-critical contract conflict.'] : [],
  });
}



test('begin与planning省略完整snapshot时零写入失败关闭', (t) => {
  const current = fixture(t, 'planning-snapshot-required');
  const before = current.runtime.inspectTaskDevelopment(current.root, current.taskId);
  assert.throws(
    () => current.runtime.recordTaskDevelopmentPlanning(current.root, current.taskId, { changeDispositions: [] }),
    (error) => error.code === 'task_development_field_required' && error.details.field === 'planning',
  );
  const after = current.runtime.inspectTaskDevelopment(current.root, current.taskId);
  assert.equal(after.development.receiptDigest, before.development.receiptDigest);
  assert.deepEqual(after.development.receipt, before.development.receipt);

  const opened = current.runtime.openWorkspaceStructuredStore(current.root, { writable: true });
  opened.database.prepare('DELETE FROM task_development_current WHERE task_id = ?').run(current.taskId);
  opened.database.close();
  assert.throws(
    () => current.runtime.beginTaskDevelopment(current.root, current.taskId, { changeDispositions: [] }),
    (error) => error.code === 'task_development_field_required' && error.details.field === 'planning',
  );
  assert.equal(current.runtime.readTaskDevelopmentPersistence(current.root, current.taskId, { optional: true }), null);
});

test('begin在Environment Receipt升级后重绑定最新schema并保留planning事实', (t) => {
  const current = fixture(t, 'environment-schema-refresh');
  const before = current.runtime.inspectTaskDevelopment(current.root, current.taskId).development.receipt;
  current.runtime.resolveTaskEnvironmentExecution = (_workspace, currentTask) => ({
    ready: true,
    taskId: currentTask,
    receiptSchema: 'buildr.task-environment-receipt/v3',
    workspaceRoot: current.root,
    environmentRoot: current.root,
    validationRoot: current.root,
    controllerInvocation: { command: process.execPath, argsPrefix: ['/retained/buildr.mjs'], sourceRoot: '/retained/buildr', kind: 'stable-controller' },
    scopes: [{ selector: 'project:demo', kind: 'project', sourcePath: 'projects/demo', executionRoot: path.join(current.root, 'projects', 'demo') }],
  });

  const result = current.runtime.beginTaskDevelopment(current.root, current.taskId, {
    changeDispositions: [],
    planning: { targetIdentity: before.planning.targetIdentity, nodes: before.planning.nodes },
  });

  assert.equal(result.development.receipt.environment.receiptSchema, 'buildr.task-environment-receipt/v3');
  assert.equal(result.development.receipt.taskContext.identity, before.taskContext.identity);
  assert.equal(result.development.receipt.planning.identity, before.planning.identity);
});

test('Development与Task Verification报告保持独立', (t) => {
  const current = fixture(t, 'development-guidance');
  let result = current.runtime.inspectTaskDevelopment(current.root, current.taskId);
  assert.equal(Object.hasOwn(result, 'formalVerificationReadiness'), false);
  assert.equal(result.next.action, 'freeze');

  result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  const candidate = result.development.receipt.candidate;
  const report = recordVerificationResultFromEvidence(current.runtime, current.root, current.taskId, {
    targetIdentity: current.targetIdentity,
    targetSummary: 'Demo Content Target',
    capabilities: [{ project: 'demo', capability: 'demo.check', outcome: 'passed', facts: ['Demo check passed.'] }],
    coverageGaps: [],
    conclusion: { outcome: 'passed', summary: 'Verified.' },
  });
  assert.equal(report.slot.applicability.status, 'current');
  result = current.runtime.inspectTaskDevelopment(current.root, current.taskId);
  assert.equal(result.development.receipt.candidate.identity, candidate.identity);
  assert.equal(result.development.receipt.verificationPolicy, null);
  assert.equal(result.development.receipt.gates.verification, null);

  completion(current, candidate);
  recordKnowledge(current);
  current.runtime.decideTaskDevelopment(current.root, current.taskId, { outcome: 'proceed', summary: 'Development facts are current.', risks: [] });
  result = current.runtime.createTaskDevelopmentHandoff(current.root, current.taskId);
  assert.equal(result.development.applicability.handoff, 'current');
});


test('Current Knowledge只让completion-critical blocked阻止handoff，attention保持可交付', (t) => {
  const current = fixture(t, 'knowledge-disposition');
  let result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  const candidate = result.development.receipt.candidate;
  completion(current, candidate);
  recordKnowledge(current, 'blocked');
  assert.throws(
    () => current.runtime.decideTaskDevelopment(current.root, current.taskId, { outcome: 'proceed', summary: 'Blocked knowledge cannot be waived.', risks: [] }),
    (error) => error.code === 'task_development_proceed_not_ready' && error.details.reasons.some((reason) => reason.code === 'current-knowledge-completion-conflict'),
  );
  result = recordKnowledge(current, 'attention');
  assert.equal(result.development.receipt.currentKnowledge.status, 'attention');
  result = current.runtime.decideTaskDevelopment(current.root, current.taskId, { outcome: 'proceed', summary: 'Explanatory drift is non-blocking.', risks: [] });
  assert.equal(result.development.receipt.decision.outcome, 'proceed');
  result = current.runtime.createTaskDevelopmentHandoff(current.root, current.taskId);
  assert.equal(result.development.receipt.handoffs.at(-1).knowledge.status, 'attention');
});

test('多Project Current Knowledge要求精确Project集合并确定性聚合顶层状态', (t) => {
  const { root } = copyFixtureWorkspace(t, 'multi-project-knowledge');
  const runtime = t.buildrContexts.application;
  const taskId = 'multi-project-knowledge';
  runtime.createTaskRecord(root, { taskId, title: 'Multi Project Knowledge', intent: 'Aggregate Project knowledge dispositions.', projects: ['demo', 'other'], services: [], changes: [] });
  runtime.resolveTaskEnvironmentExecution = (_workspace, currentTask) => ({
    ready: true, taskId: currentTask, receiptSchema: 'buildr.task-environment-receipt/v2', workspaceRoot: root, environmentRoot: root, validationRoot: root,
    controllerInvocation: { command: process.execPath, argsPrefix: ['/retained/buildr.mjs'], sourceRoot: '/retained/buildr', kind: 'stable-controller' },
    scopes: [
      { selector: 'project:demo', kind: 'project', sourcePath: 'projects/demo', executionRoot: path.join(root, 'projects', 'demo') },
      { selector: 'project:other', kind: 'project', sourcePath: 'projects/other', executionRoot: path.join(root, 'projects', 'other') },
    ],
  });
  pinImmutableTaskRecord(runtime, root, taskId);
  const planningTargetIdentity = taskDevelopmentDigest(`${taskId}:plan`);
  runtime.recordTaskReview(root, taskId, { reviewType: 'planning', targetIdentity: planningTargetIdentity, method: 'self', reviewed: ['Multi Project plan'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Ready.' } });
  const observed = runtime.observeTaskDevelopment(root, taskId, { changeDispositions: [], planningTargetIdentity });
  const treeIdentity = observed.development.receipt.contentTarget.identity;
  assert.throws(() => runtime.recordTaskDevelopmentKnowledge(root, taskId, {
    treeIdentity,
    projects: [{ project: 'demo', status: 'aligned', summary: 'Demo aligned.', sourceIdentities: ['demo:knowledge'], unresolvedItems: [] }],
  }), (error) => error.code === 'task_development_knowledge_projects_incomplete' && error.details.expectedProjects.includes('other'));

  const result = runtime.recordTaskDevelopmentKnowledge(root, taskId, {
    treeIdentity,
    projects: [
      { project: 'other', status: 'attention', summary: 'Other has explanatory drift.', sourceIdentities: ['other:knowledge'], unresolvedItems: ['Refresh explanatory note.'] },
      { project: 'demo', status: 'aligned', summary: 'Demo aligned.', sourceIdentities: ['demo:knowledge'], unresolvedItems: [] },
    ],
  });
  assert.equal(result.development.receipt.currentKnowledge.status, 'attention');
  assert.deepEqual(result.development.receipt.currentKnowledge.projects.map((item) => item.project), ['demo', 'other']);
  assert.deepEqual(result.development.receipt.currentKnowledge.sourceIdentities, ['demo:knowledge', 'other:knowledge']);
});



test('converged disposition只接受Task working copy archived，retained active不阻塞', (t) => {
  const current = changeFixture(t, 'working-copy-archived');
  const result = current.runtime.observeTaskDevelopment(current.root, current.taskId, {
    changeDispositions: current.dispositions,
    planningTargetIdentity: current.planningTargetIdentity,
  });
  assert.equal(result.development.receipt.taskContext.changes[0].disposition, 'converged');
  assert.ok(result.development.receipt.contentTarget);
});

test('observe对pending Change零Content observation失败关闭，空Change与not-applicable继续合法', (t) => {
  const pending = changeFixture(t, 'pending-content-target', { availability: 'available', lifecycle: 'active' });
  let contentObservations = 0;
  const observeContent = pending.runtime.observeTaskContentComponents;
  pending.runtime.observeTaskContentComponents = (...args) => {
    contentObservations += 1;
    return observeContent(...args);
  };
  assert.throws(() => pending.runtime.observeTaskDevelopment(pending.root, pending.taskId, {
    changeDispositions: [{ project: 'demo', change: 'convergence-guard', disposition: 'pending', summary: 'Implementation remains active.' }],
    planningTargetIdentity: pending.planningTargetIdentity,
  }), (error) => error.code === 'task_development_change_pending_for_content_target'
    && error.details.pendingChanges[0] === 'demo/convergence-guard');
  assert.equal(contentObservations, 0);
  assert.equal(pending.runtime.readTaskDevelopmentPersistence(pending.root, pending.taskId, { optional: true }), null);

  const notApplicable = changeFixture(t, 'not-applicable-content-target', { availability: 'available', lifecycle: 'active' });
  const result = notApplicable.runtime.observeTaskDevelopment(notApplicable.root, notApplicable.taskId, {
    changeDispositions: [{ project: 'demo', change: 'convergence-guard', disposition: 'not-applicable', summary: 'No Change convergence applies to this target.' }],
    planningTargetIdentity: notApplicable.planningTargetIdentity,
  });
  assert.ok(result.development.receipt.contentTarget);
  assert.equal(result.development.receipt.taskContext.changes[0].disposition, 'not-applicable');

  const codeOnly = fixture(t, 'empty-change-content-target');
  assert.match(codeOnly.targetIdentity, /^sha256-/);
});

test('active或resolver不可用的Change不能伪报converged', (t) => {
  const active = changeFixture(t, 'working-copy-active', { availability: 'available', lifecycle: 'active' });
  assert.throws(() => active.runtime.observeTaskDevelopment(active.root, active.taskId, {
    changeDispositions: active.dispositions,
    planningTargetIdentity: active.planningTargetIdentity,
  }), (error) => error.code === 'task_development_change_not_converged'
    && error.details.availability === 'available'
    && error.details.lifecycle === 'active');

  const unavailable = changeFixture(t, 'working-copy-unavailable', { availability: 'unavailable', lifecycle: null });
  assert.throws(() => unavailable.runtime.observeTaskDevelopment(unavailable.root, unavailable.taskId, {
    changeDispositions: unavailable.dispositions,
    planningTargetIdentity: unavailable.planningTargetIdentity,
  }), (error) => error.code === 'task_development_change_not_converged'
    && error.details.availability === 'unavailable'
    && error.details.lifecycle === null);
});

test('已保存converged后外部漂移使inspect overlay stale且不推荐Finish，Receipt不变，下一正式action fail closed', (t) => {
  const current = changeFixture(t, 'working-copy-drift');
  let result = freezeChangeFixture(current);
  assert.equal(result.development.receipt.candidate.generation, 1);
  const savedObservedAt = result.development.observedAt;
  const savedApplicability = current.runtime.readTaskDevelopmentPersistence(current.root, current.taskId).applicability;
  assert.match(savedObservedAt, /^2026-|^20\d\d-/);
  assert.equal(savedApplicability.candidate, 'current');

  current.setObserved({ availability: 'available', lifecycle: 'active' });
  result = current.runtime.inspectTaskDevelopment(current.root, current.taskId);
  assert.deepEqual(result.effects, []);
  assert.equal(result.development.observedAt, savedObservedAt);
  assert.equal(result.development.applicability.status, 'developing');
  assert.equal(result.development.applicability.taskContext, 'stale');
  assert.equal(result.development.applicability.candidate, 'stale');
  assert.equal(result.next.mode, 'required');
  assert.equal(result.next.owner, 'task-development');
  assert.equal(result.next.action, 'planning');
  assert.equal(result.next.owner === 'task-finish', false);
  const unproven = result.development.applicability.reasons.find((item) => item.code === 'change-lifecycle-unproven');
  assert.deepEqual(unproven, {
    axis: 'task-context',
    code: 'change-lifecycle-unproven',
    unproven: [{ project: 'demo', change: 'convergence-guard', availability: 'available', lifecycle: 'active' }],
  });
  const persisted = current.runtime.readTaskDevelopmentPersistence(current.root, current.taskId);
  assert.equal(persisted.observedAt, savedObservedAt);
  assert.equal(persisted.applicability.taskContext, 'current');
  assert.equal(persisted.applicability.candidate, 'current');
  assert.throws(() => current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId), (error) => error.code === 'task_development_change_not_converged');
});

test('handoff-current后working copy不可用时Development inspect不推荐Finish且不改写handoff', (t) => {
  const current = changeFixture(t, 'handoff-working-copy-missing');
  let result = handoffChangeFixture(current);
  assert.equal(result.development.applicability.handoff, 'current');
  assert.equal(result.next.action, 'report');
  assert.equal(result.next.owner, 'agent');
  assert.equal(result.next.capability, null);
  const savedHandoffs = result.development.receipt.handoffs;
  const savedObservedAt = result.development.observedAt;

  current.setObserved({ availability: 'unavailable', lifecycle: null });
  result = current.runtime.inspectTaskDevelopment(current.root, current.taskId);
  assert.deepEqual(result.effects, []);
  assert.equal(result.development.observedAt, savedObservedAt);
  assert.equal(result.development.applicability.status, 'developing');
  assert.equal(result.development.applicability.taskContext, 'stale');
  assert.equal(result.development.applicability.candidate, 'stale');
  assert.equal(result.development.applicability.handoff, 'stale');
  assert.equal(result.next.action, 'planning');
  assert.notEqual(result.next.owner, 'task-finish');
  assert.deepEqual(result.development.receipt.handoffs, savedHandoffs);
  const unproven = result.development.applicability.reasons.find((item) => item.code === 'change-lifecycle-unproven');
  assert.equal(unproven.unproven[0].availability, 'unavailable');
  assert.equal(unproven.unproven[0].lifecycle, null);

});

function freezeChangeFixture(current) {
  let result = current.runtime.observeTaskDevelopment(current.root, current.taskId, {
    changeDispositions: current.dispositions,
    planningTargetIdentity: current.planningTargetIdentity,
  });
  current.targetIdentity = result.development.receipt.contentTarget.identity;
  result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  return current.runtime.inspectTaskDevelopment(current.root, current.taskId);
}

function handoffChangeFixture(current) {
  const frozen = freezeChangeFixture(current);
  const candidate = frozen.development.receipt.candidate;
  completion(current, candidate);
  recordKnowledge(current);
  current.runtime.decideTaskDevelopment(current.root, current.taskId, { outcome: 'proceed', summary: 'Current positive gates.', risks: [] });
  return current.runtime.createTaskDevelopmentHandoff(current.root, current.taskId);
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
  const runtime = t.buildrContexts.application;
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
  const targetIdentity = result.development.receipt.contentTarget.identity;
  result = runtime.freezeTaskDevelopmentCandidate(root, taskId);
  const candidate = result.development.receipt.candidate;
  runtime.recordTaskReview(root, taskId, { reviewType: 'completion', targetIdentity: candidate.identity, method: 'self', reviewed: ['Git Task Candidate'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Ready.' } });
  recordKnowledge({ runtime, root, taskId });
  runtime.decideTaskDevelopment(root, taskId, { outcome: 'proceed', summary: 'Current positive gates.', risks: [] });
  result = runtime.createTaskDevelopmentHandoff(root, taskId);
  return { root, taskRoot, runtime, taskId, planningTargetIdentity, candidate, handoff: result.development.receipt.handoffs.at(-1), targetIdentity };
}


test('任务验证报告刷新不递增generation，Content变化才递增', (t) => {
  const current = fixture(t, 'generation-refresh');
  let result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  const first = result.development.receipt.candidate;
  const firstReport = recordVerificationResultFromEvidence(current.runtime, current.root, current.taskId, {
    targetIdentity: current.targetIdentity, targetSummary: 'Demo Content Target',
    capabilities: [{ project: 'demo', capability: 'demo.check', outcome: 'passed', facts: ['First report.'] }],
    coverageGaps: [], conclusion: { outcome: 'passed', summary: 'First report passed.' },
  });
  const replacement = recordVerificationResultFromEvidence(current.runtime, current.root, current.taskId, {
    targetIdentity: current.targetIdentity, targetSummary: 'Demo Content Target',
    capabilities: [{ project: 'demo', capability: 'demo.check', outcome: 'passed', facts: ['Replacement report.'] }],
    coverageGaps: [], conclusion: { outcome: 'passed', summary: 'Replacement report passed.' },
  });
  assert.notEqual(replacement.slot.reportDigest, firstReport.slot.reportDigest);
  result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  assert.equal(result.status, 'unchanged');
  assert.equal(result.development.receipt.candidate.identity, first.identity);
  assert.equal(result.development.receipt.generation, 1);

  fs.appendFileSync(path.join(current.root, 'projects', 'demo', 'README.md'), 'Changed content.\n');
  result = current.runtime.observeTaskDevelopment(current.root, current.taskId, { changeDispositions: [], planningTargetIdentity: current.planningTargetIdentity });
  assert.equal(result.development.receipt.candidate, null);
  current.targetIdentity = result.development.receipt.contentTarget.identity;
  result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  assert.equal(result.development.receipt.generation, 2);
  assert.notEqual(result.development.receipt.candidate.identity, first.identity);
});


test('读取只返回最近一次 Development lifecycle snapshot，不重新观察外部内容', (t) => {
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
    verification: null,
    completion: { ...result.development.receipt.gates.completion, applicability: 'current' },
  });
  result = shared.runtime.freezeTaskDevelopmentCandidate(shared.root, shared.taskId);
  assert.equal(result.status, 'unchanged');
  assert.equal(result.development.receipt.candidate.generation, 1);

  const taskSource = fs.readFileSync(path.join(shared.taskRoot, 'shared.txt'));
  fs.appendFileSync(path.join(shared.taskRoot, 'shared.txt'), 'changed contribution\n');
  result = shared.runtime.inspectTaskDevelopment(shared.root, shared.taskId);
  assert.equal(result.development.applicability.contentTarget, 'current');
  assert.equal(result.development.applicability.candidate, 'current');
  assert.equal(result.development.applicability.handoff, 'current');

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
