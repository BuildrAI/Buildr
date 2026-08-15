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
  run(['project', 'create', 'other', '--target', fixtureTemplateRoot, '--name', 'Other', '--description', 'Other project']);
  const serviceSource = path.join(fixtureTemplateBase, 'service-source');
  fs.mkdirSync(serviceSource);
  fs.writeFileSync(path.join(serviceSource, 'README.md'), '# Demo API\n');
  run(['service', 'create', 'demo/api', serviceSource, '--target', fixtureTemplateRoot, '--name', 'Demo API', '--description', 'Demo service', '--type', 'backend']);
  fs.writeFileSync(path.join(fixtureTemplateRoot, 'projects', 'demo', 'README.md'), '# Demo\n');
  writeVerificationDeclaration(fixtureTemplateRoot);
  fs.writeFileSync(path.join(fixtureTemplateRoot, 'projects', 'other', 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v2', resources: [], capabilities: [],
  }));
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

function changeFixture(t, taskId, initial = { availability: 'available', lifecycle: 'archived' }) {
  const { root } = copyFixtureWorkspace(t, 'change-convergence');
  const runtime = createRuntime();
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
    scopes: [{ selector: 'project:demo', kind: 'project', sourcePath: 'projects/demo', executionRoot: path.join(root, 'projects', 'demo') }],
  });
  pinImmutableTaskRecord(runtime, root, taskId);
  const planningTargetIdentity = taskDevelopmentDigest(`${taskId}:plan`);
  runtime.recordTaskReview(root, taskId, { reviewType: 'planning', targetIdentity: planningTargetIdentity, method: 'self', reviewed: ['Change convergence guard'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Ready.' } });
  const dispositions = [{ project: 'demo', change: 'convergence-guard', disposition: 'converged', summary: 'Change converged.' }];
  return { root, runtime, taskId, planningTargetIdentity, dispositions, setObserved(value) { observed = value; } };
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

function workspaceOnlyFixture(t, taskId) {
  const { root } = copyFixtureWorkspace(t, 'workspace-only');
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId, title: 'Develop workspace content', intent: 'Deliver a workspace-only formal Task.', projects: [], services: [], changes: [] });
  runtime.resolveTaskEnvironmentExecution = (_workspace, currentTask) => ({
    ready: true,
    taskId: currentTask,
    receiptSchema: 'buildr.task-environment-receipt/v2',
    workspaceRoot: root,
    environmentRoot: root,
    validationRoot: root,
    scopes: [{ selector: 'workspace', kind: 'workspace', sourcePath: '.', executionRoot: root }],
  });
  const planningTargetIdentity = taskDevelopmentDigest(`${taskId}:plan`);
  runtime.recordTaskReview(root, taskId, { reviewType: 'planning', targetIdentity: planningTargetIdentity, method: 'self', reviewed: ['Workspace-only Task plan'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Ready.' } });
  const observed = runtime.observeTaskDevelopment(root, taskId, { changeDispositions: [], planningTargetIdentity });
  return { root, runtime, taskId, planningTargetIdentity, targetIdentity: observed.development.receipt.contentTarget.identity };
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

test('Development result按保存事实给出单一建议方向且不自动推进', (t) => {
  const current = fixture(t, 'development-guidance');
  let result = current.runtime.inspectTaskDevelopment(current.root, current.taskId);
  assert.equal(result.nextActions.length, 1);
  assert.equal(result.formalVerificationReadiness.status, 'unknown');
  assert.equal(result.next.owner, 'current-knowledge-maintenance');
  assert.match(result.nextActions[0], /current knowledge inspect/);

  recordVerification(current);
  result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  assert.match(result.nextActions[0], /task-review/);
  const candidate = result.development.receipt.candidate;

  current.runtime.recordTaskReview(current.root, current.taskId, {
    reviewType: 'completion', targetIdentity: candidate.identity, method: 'self', reviewed: ['Current Candidate'], uncovered: [], findings: [],
    conclusion: { outcome: 'ready', summary: 'Ready.' },
  });
  result = current.runtime.decideTaskDevelopment(current.root, current.taskId, { outcome: 'proceed', summary: 'All current gates are ready.', risks: [] });
  assert.match(result.nextActions[0], /handoff/);
  assert.equal(result.development.receipt.handoffs.length, 0);

  result = current.runtime.createTaskDevelopmentHandoff(current.root, current.taskId);
  assert.match(result.nextActions[0], /明确交付授权/);
  assert.equal(result.development.applicability.handoff, 'current');
});

test('workspace-only policy、负向 Verification、风险决定与 handoff 形成完整 current 生命周期', (t) => {
  const current = workspaceOnlyFixture(t, 'workspace-only-lifecycle');
  assert.deepEqual(current.runtime.observeTaskVerificationDeclarations(current.root, current.taskId, current.root), []);
  let result = current.runtime.recordTaskDevelopmentPolicy(current.root, current.taskId, {
    capabilities: [], coverageGaps: [{ scope: 'workspace', summary: 'No workspace verification capability.' }], overrides: [],
  });
  const policy = result.development.receipt.verificationPolicy;
  assert.deepEqual(policy.declarations, []);
  assert.match(policy.identity, /^sha256-/);
  assert.equal(result.development.applicability.policy, 'current');
  assert.throws(() => current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId), (error) => error.code === 'task_development_candidate_not_ready'
    && error.details.reasons.some((reason) => reason.axis === 'verification'));

  const verification = current.runtime.recordTaskVerification(current.root, current.taskId, {
    targetIdentity: current.targetIdentity,
    targetSummary: 'Workspace-only Content Target',
    capabilities: [],
    coverageGaps: [{ scope: 'workspace', summary: 'No workspace verification capability.' }],
    conclusion: { outcome: 'not-passed', summary: 'Workspace coverage gap remains.' },
    declarationRoot: current.root,
  });
  assert.equal(verification.slot.applicability.status, 'current');
  assert.equal(verification.slot.result.conclusion.outcome, 'not-passed');
  assert.deepEqual(verification.nextActions, []);
  result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  const candidate = result.development.receipt.candidate;
  assert.equal(candidate.generation, 1);
  const review = current.runtime.recordTaskReview(current.root, current.taskId, { reviewType: 'completion', targetIdentity: candidate.identity, method: 'self', reviewed: ['Workspace-only Candidate'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Ready with explicit verification risk acceptance.' } });
  assert.throws(() => current.runtime.decideTaskDevelopment(current.root, current.taskId, { outcome: 'proceed', summary: 'Risk missing.', risks: [] }), (error) => error.code === 'task_development_risk_acceptance_required');
  current.runtime.decideTaskDevelopment(current.root, current.taskId, {
    outcome: 'proceed', summary: 'Authorized workspace coverage risk.',
    risks: [{ gate: 'verification', resultDigest: verification.slot.resultDigest, scope: 'workspace', summary: 'No workspace verification capability is available.', source: 'user:workspace-only-regression' }],
  });
  result = current.runtime.createTaskDevelopmentHandoff(current.root, current.taskId);
  const handoff = result.development.receipt.handoffs.at(-1);
  assert.equal(result.development.applicability.handoff, 'current');
  assert.equal(handoff.gates.completion.resultDigest, review.slots.completion.resultDigest);
  assert.equal(handoff.decision.risks[0].scope, 'workspace');

  fs.appendFileSync(path.join(current.root, 'README.md'), '\nworkspace target changed\n');
  result = current.runtime.observeTaskDevelopment(current.root, current.taskId, { changeDispositions: [], planningTargetIdentity: current.planningTargetIdentity });
  assert.equal(result.development.receipt.verificationPolicy, null);
  assert.equal(result.development.receipt.candidate, null);
  assert.deepEqual(result.development.receipt.handoffs, [handoff]);
  assert.equal(result.development.applicability.handoff, 'stale');
});

test('Service-only、Change-only 与多 Project Task 观察完整 declaration，不能伪装成 workspace-only', (t) => {
  const { root } = copyFixtureWorkspace(t, 'effective-projects');
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'service-only', title: 'Service only', intent: 'Observe parent Project declaration.', projects: [], services: ['demo/api'], changes: [] });
  assert.deepEqual(runtime.observeTaskVerificationDeclarations(root, 'service-only', root).map((item) => item.project), ['demo']);
  runtime.createTaskRecord(root, { taskId: 'multi-project', title: 'Multi Project', intent: 'Observe all Project declarations.', projects: ['other', 'demo'], services: ['demo/api'], changes: [] });
  assert.deepEqual(runtime.observeTaskVerificationDeclarations(root, 'multi-project', root).map((item) => item.project), ['demo', 'other']);
  runtime.createTaskRecordPersistence(root, {
    schemaVersion: 'buildr.task-record/v2', taskId: 'change-only', title: 'Change only', intent: 'Observe the Change parent Project declaration.',
    scope: { projects: [], services: [] }, changes: [{ project: 'demo', change: 'declaration-scope' }],
    parentTaskId: null, childTaskIds: [], retrospectiveSourceTaskIds: [], status: 'active', result: null,
    createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z',
  });
  assert.deepEqual(runtime.observeTaskVerificationDeclarations(root, 'change-only', root).map((item) => item.project), ['demo']);

  runtime.resolveTaskEnvironmentExecution = () => ({ ready: true, taskId: 'service-only', receiptSchema: 'buildr.task-environment-receipt/v2', workspaceRoot: root, environmentRoot: root, validationRoot: root, scopes: [{ selector: 'workspace', kind: 'workspace', sourcePath: '.', executionRoot: root }, { selector: 'service:demo/api', kind: 'service', sourcePath: '.', executionRoot: root }] });
  const planningTargetIdentity = taskDevelopmentDigest('service-only:plan');
  runtime.recordTaskReview(root, 'service-only', { reviewType: 'planning', targetIdentity: planningTargetIdentity, method: 'self', reviewed: ['Service plan'], uncovered: [], findings: [], conclusion: { outcome: 'ready', summary: 'Ready.' } });
  runtime.observeTaskDevelopment(root, 'service-only', { changeDispositions: [], planningTargetIdentity });
  assert.throws(() => runtime.recordTaskDevelopmentPolicy(root, 'service-only', { capabilities: [], coverageGaps: [{ scope: 'workspace', summary: 'Forged workspace gap.' }], overrides: [] }), (error) => error.code === 'task_development_policy_gap_out_of_scope');
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

  const codeOnly = workspaceOnlyFixture(t, 'empty-change-content-target');
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

test('已保存converged后外部漂移不改变inspect快照，下一正式action会fail closed', (t) => {
  const current = changeFixture(t, 'working-copy-drift');
  let result = current.runtime.observeTaskDevelopment(current.root, current.taskId, {
    changeDispositions: current.dispositions,
    planningTargetIdentity: current.planningTargetIdentity,
  });
  result = current.runtime.recordTaskDevelopmentPolicy(current.root, current.taskId, { capabilities: [{ project: 'demo', capability: 'demo.check', required: true }], coverageGaps: [], overrides: [] });
  current.targetIdentity = result.development.receipt.contentTarget.identity;
  recordVerification(current);
  result = current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId);
  assert.equal(result.development.receipt.candidate.generation, 1);
  const savedObservedAt = result.development.observedAt;
  assert.match(savedObservedAt, /^2026-|^20\d\d-/);

  current.setObserved({ availability: 'available', lifecycle: 'active' });
  result = current.runtime.inspectTaskDevelopment(current.root, current.taskId);
  assert.equal(result.development.applicability.taskContext, 'current');
  assert.equal(result.development.applicability.candidate, 'current');
  assert.equal(result.development.observedAt, savedObservedAt);
  assert.throws(() => current.runtime.freezeTaskDevelopmentCandidate(current.root, current.taskId), (error) => error.code === 'task_development_change_not_converged');
});

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
    verification: { ...result.development.receipt.gates.verification, applicability: 'current' },
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
