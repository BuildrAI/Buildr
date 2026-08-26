import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import YAML from 'yaml';

import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';
import { cleanupLocalTaskLifecycleSystemContext, copyTaskLifecycleWorkspace } from '../helpers/task-lifecycle-system-context.mjs';
import { recordVerificationResultFromEvidence } from '../helpers/task-verification-result-fixture.mjs';
import { createVerificationPlan, createVerificationRequest } from '../../src/verification/domain/verification-plan.mjs';

const test = createBuildrApplicationTest('integration-task-verification-repository');

after(() => cleanupLocalTaskLifecycleSystemContext());

function declaration() {
  return { schemaVersion: 'buildr.project-verification/v3', resources: [], capabilities: [{ id: 'demo.unit', title: 'Demo unit', scope: { project: 'demo', services: [] }, proves: ['Demo unit behavior'], evidence: ['unit'], usableFor: ['task-delivery'], discovery: { sources: ['**'] }, invocation: { affected: { kind: 'command', argv: ['node', '-e', 'void 0'], cwd: '.' }, full: { kind: 'command', argv: ['node', '-e', 'void 0'], cwd: '.' } }, environment: { requires: ['node'] }, effects: { writes: [], externalSystems: [], authorization: 'implicit' }, resourceClaims: [] }] };
}
function fixture(t, runtime) {
  const root = fs.realpathSync(copyTaskLifecycleWorkspace(t, 'task-verification-repository').root);
  runtime.createTaskRecord(root, {
    taskId: 'demo-task',
    title: 'Demo',
    intent: 'Verify current Result authority',
    projects: ['demo'],
    services: [],
    changes: [],
  });
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify(declaration()));
  return root;
}
function input(overrides = {}) { return { targetIdentity: 'target:one', targetSummary: 'Demo delivery target', capabilities: [{ project: 'demo', capability: 'demo.unit', outcome: 'passed', facts: ['unit passed'] }], coverageGaps: [], conclusion: { outcome: 'passed', summary: 'Demo verified' }, ...overrides }; }
function stored(runtime, root) { const opened = runtime.openWorkspaceStructuredStore(root, { writable: false }); try { return opened.database.prepare("SELECT result_json FROM task_verification_current WHERE task_id = 'demo-task'").get()?.result_json ?? null; } finally { opened.database.close(); } }

test('Formal Plan只读投影selected policy与not-selected disposition', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  const declarationFile = path.join(root, 'projects', 'demo', 'verification.yml');
  const expanded = declaration();
  expanded.capabilities.push({ ...structuredClone(expanded.capabilities[0]), id: 'demo.browser', title: 'Demo browser', discovery: { sources: ['web/**'] } });
  fs.writeFileSync(declarationFile, YAML.stringify(expanded));
  const declarationIdentity = `sha256-${crypto.createHash('sha256').update(fs.readFileSync(declarationFile)).digest('hex')}`;
  const plan = createVerificationPlan({
    request: createVerificationRequest({
      project: 'demo', services: [], target: { kind: 'task-delivery', identity: 'target:one' }, selection: { scope: 'affected' },
      changedPaths: ['src/demo.mjs'], risks: [], declarations: [{ project: 'demo', identity: declarationIdentity }], dependencies: [],
    }),
    declaration: expanded,
  });
  const material = structuredClone(plan);
  delete material.identity;
  material.selectedItems = [...material.selectedItems, { ...structuredClone(material.selectedItems[0]), id: 'demo-unit-secondary-item' }];
  const providerStylePlan = { ...material, identity: `sha256-${crypto.createHash('sha256').update(JSON.stringify(material)).digest('hex')}` };
  const before = runtime.inspectTaskVerification(root, 'demo-task');
  const projection = runtime.deriveTaskVerificationPolicyInput(root, 'demo-task', {
    targetIdentity: 'target:one', formalPlans: [{ project: 'demo', document: providerStylePlan }], declarationRoot: root,
  });
  assert.equal(projection.status, 'ready');
  assert.deepEqual(projection.inputJson, { capabilities: [{ project: 'demo', capability: 'demo.unit', required: true }], coverageGaps: [], overrides: [] });
  assert.deepEqual(projection.selection.notSelectedCapabilities, [{ project: 'demo', capability: 'demo.browser', disposition: 'not-selected', reason: 'not-selected-by-plan' }]);
  assert.deepEqual(projection.effects, []);
  assert.deepEqual(runtime.inspectTaskVerification(root, 'demo-task'), before);
  assert.throws(() => runtime.deriveTaskVerificationPolicyInput(root, 'demo-task', {
    targetIdentity: 'target:stale', formalPlans: [{ project: 'demo', document: plan }], declarationRoot: root,
  }), (error) => error.code === 'task_verification_policy_plan_target_mismatch');
});

test('Verification current Result只写SQLite并保持target/declaration applicability', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  const legacy = path.join(root, '.buildr', 'tasks', 'demo-task', 'verification.yml');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, 'legacy: inert\n');
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.present, false);

  const recorded = recordVerificationResultFromEvidence(runtime, root, 'demo-task', input());
  assert.equal(recorded.slot.path, 'workspace-sqlite:task-verification/demo-task');
  assert.equal(recorded.slot.applicability.status, 'current');
  assert.equal(recorded.slot.applicability.declarations.status, 'current');
  assert.doesNotMatch(stored(runtime, root), /resultDigest|applicability|revision|requiredAssurance|stdout|stderr/);
  const unknown = runtime.inspectTaskVerification(root, 'demo-task').slot.applicability;
  assert.equal(unknown.status, 'unknown');
  assert.deepEqual(unknown.reasons.map((reason) => reason.code), ['candidate-identity-not-provided', 'target-identity-not-provided', 'declaration-identities-not-provided']);
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:two' }).slot.applicability.status, 'stale');

  const changed = declaration();
  changed.capabilities[0].proves = ['Changed declaration'];
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify(changed));
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one' }).slot.applicability.status, 'unknown');
  assert.equal(fs.readFileSync(legacy, 'utf8'), 'legacy: inert\n');
});

test('Task Verification生成提示把Project声明版本交给selected provider与contract', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  const { prompt } = runtime.generateTaskVerificationPrompt(root, { taskId: 'demo-task', targetIdentity: 'target:one' });
  assert.match(prompt, /各 Project 当前的 verification\.yml/);
  assert.match(prompt, /selected Task Verification provider 按其支持的声明契约解析/);
  assert.match(prompt, /coverage gap/);
  assert.match(prompt, /Declaration Intake/);
  assert.doesNotMatch(prompt, /verification\.yml v\d+/);
  assert.doesNotMatch(prompt, /buildr\.project-verification\/v\d+/);
});

test('Project Result拒绝claimed facts，Candidate不匹配的authority对账保持原current', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  assert.throws(() => runtime.recordTaskVerification(root, 'demo-task', {
    candidateIdentity: 'sha256-claimed-candidate', candidateGeneration: 1,
    targetIdentity: 'target:claimed', targetSummary: 'Claimed target',
    capabilities: input().capabilities, coverageGaps: [], conclusion: input().conclusion, declarationRoot: root,
  }), (error) => error.code === 'task_verification_claimed_facts_forbidden');
  assert.equal(stored(runtime, root), null);

  const recorded = recordVerificationResultFromEvidence(runtime, root, 'demo-task', input());
  const original = stored(runtime, root);
  const recordId = recorded.slot.result.capabilities[0].evidence.recordId;
  assert.throws(() => runtime.reconcileTaskVerification(root, 'demo-task', {
    candidateIdentity: 'sha256-stale-candidate', candidateGeneration: 2,
    targetIdentity: 'target:one', targetSummary: 'Stale Candidate target', recordIds: [recordId], coverageGaps: [], declarationRoot: root,
  }), (error) => error.code === 'task_verification_evidence_candidate_mismatch');
  assert.equal(stored(runtime, root), original);
});

test('同一次交付对账拒绝混用不同Verification Plan的Execution Records', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  const first = recordVerificationResultFromEvidence(runtime, root, 'demo-task', input({ planIdentity: 'sha256-plan-one' }));
  const second = recordVerificationResultFromEvidence(runtime, root, 'demo-task', input({ planIdentity: 'sha256-plan-two' }));
  const candidate = second.slot.result.candidate;
  assert.throws(() => runtime.reconcileTaskVerification(root, 'demo-task', {
    candidateIdentity: candidate.identity,
    candidateGeneration: candidate.generation,
    targetIdentity: 'target:one',
    targetSummary: 'Mixed plans must fail',
    recordIds: [first.slot.result.capabilities[0].evidence.recordId, second.slot.result.capabilities[0].evidence.recordId],
    coverageGaps: [],
    declarationRoot: root,
  }), (error) => error.code === 'task_verification_evidence_plan_mismatch');
});

test('Verification只从canonical或matching ready Task Environment观察declaration', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  const candidateRoot = `${root}-candidate`;
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-verification-foreign-'));
  t.after(() => fs.rmSync(candidateRoot, { recursive: true, force: true }));
  t.after(() => fs.rmSync(foreignRoot, { recursive: true, force: true }));
  fs.cpSync(root, candidateRoot, { recursive: true });
  const candidateDeclaration = declaration();
  candidateDeclaration.capabilities[0].proves = ['Candidate declaration'];
  fs.writeFileSync(path.join(candidateRoot, 'projects', 'demo', 'verification.yml'), YAML.stringify(candidateDeclaration));
  assert.throws(() => recordVerificationResultFromEvidence(runtime, root, 'demo-task', input({ declarationRoot: foreignRoot })), (error) => error.code === 'task_verification_declaration_root_unowned');
  runtime.resolveTaskEnvironmentExecution = () => ({ ready: true, environmentRoot: candidateRoot });
  const recorded = recordVerificationResultFromEvidence(runtime, root, 'demo-task', input({ declarationRoot: candidateRoot }));
  assert.equal(recorded.slot.result.declarations[0].path, 'projects/demo/verification.yml');
  assert.equal(JSON.stringify(recorded.slot.result).includes(candidateRoot), false);
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one', declarations: recorded.slot.result.declarations, candidate: recorded.slot.result.candidate }).slot.applicability.status, 'current');
  assert.throws(() => runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one', declarationRoot: candidateRoot }), (error) => error.code === 'task_verification_field_forbidden');
});

test('Verification serialization或SQLite mutation失败保留last-valid current', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  recordVerificationResultFromEvidence(runtime, root, 'demo-task', input());
  const original = stored(runtime, root);
  runtime.taskVerificationSerialize = () => { throw new Error('serialization failure'); };
  assert.throws(() => recordVerificationResultFromEvidence(runtime, root, 'demo-task', input({ targetIdentity: 'target:serialization' })), (error) => error.code === 'task_verification_write_failed' && error.details.stage === 'serialization');
  runtime.taskVerificationSerialize = null;
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
  opened.database.exec("CREATE TRIGGER reject_verification_update BEFORE UPDATE ON task_verification_current BEGIN SELECT RAISE(ABORT, 'injected mutation failure'); END;");
  opened.database.close();
  assert.throws(() => recordVerificationResultFromEvidence(runtime, root, 'demo-task', input({ targetIdentity: 'target:mutation' })), (error) => error.code === 'task_verification_write_failed' && error.details.stage === 'mutation' && error.details.rollback.status === 'restored');
  assert.equal(stored(runtime, root), original);
});

test('terminal Task仍可读取既有Verification且拒绝新写入', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  recordVerificationResultFromEvidence(runtime, root, 'demo-task', input());
  const task = runtime.readTaskRecordPersistence(root, 'demo-task');
  runtime.writeTaskRecordPersistence(root, { ...task.record, status: 'completed', result: { summary: 'done', noChange: false }, updatedAt: new Date(Date.parse(task.record.createdAt) + 1000).toISOString() });
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:one' }).slot.present, true);
  assert.throws(() => recordVerificationResultFromEvidence(runtime, root, 'demo-task', input()), (error) => error.code === 'task_execution_record_task_terminal');
});

test('workspace-only Result写入同一SQLite authority，scope变化后兼容读取并派生stale', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  runtime.createTaskRecord(root, { taskId: 'workspace-task', title: 'Workspace only', intent: 'Persist a typed workspace coverage gap.', projects: [], services: [], changes: [] });
  const recorded = recordVerificationResultFromEvidence(runtime, root, 'workspace-task', {
    targetIdentity: 'workspace:one', targetSummary: 'Workspace target', capabilities: [],
    coverageGaps: [{ scope: 'workspace', summary: 'No workspace verification capability.' }],
    conclusion: { outcome: 'not-passed', summary: 'Workspace coverage gap remains.' }, declarationRoot: root,
  });
  assert.equal(recorded.slot.path, 'workspace-sqlite:task-verification/workspace-task');
  assert.deepEqual(recorded.slot.result.declarations, []);
  assert.equal(recorded.slot.result.conclusion.outcome, 'not-passed');

  const current = runtime.readTaskRecordPersistence(root, 'workspace-task').record;
  runtime.writeTaskRecordPersistence(root, {
    ...current,
    scope: { projects: ['demo'], services: [] },
    updatedAt: new Date(Date.parse(current.updatedAt) + 1000).toISOString(),
  });
  assert.deepEqual(runtime.readTaskVerificationResultPersistence(root, 'workspace-task').result.declarations, [], 'old self-described Result remains readable');
  assert.equal(runtime.readTaskVerificationResultPersistence(root, 'workspace-task').result.schemaVersion, 'buildr.task-verification-result/v2');
  const declarations = runtime.observeTaskVerificationDeclarations(root, 'workspace-task', root).map(({ project, path: declarationPath, identity }) => ({ project, path: declarationPath, identity }));
  const inspected = runtime.inspectTaskVerification(root, 'workspace-task', { targetIdentity: 'workspace:one', declarations });
  assert.equal(inspected.slot.applicability.declarations.status, 'stale');
  assert.equal(inspected.slot.applicability.status, 'stale');
  assert.ok(inspected.slot.applicability.reasons.some((reason) => reason.code === 'project-scope-added' && reason.project === 'demo'));
});

test('合法v1 Result只读兼容且明确标记legacy candidate-unbound', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  runtime.writeTaskVerificationResultPersistence(root, {
    schemaVersion: 'buildr.task-verification-result/v1', taskId: 'demo-task',
    target: { identity: 'target:legacy', summary: 'Legacy target' },
    declarations: runtime.observeTaskVerificationDeclarations(root, 'demo-task', root).map(({ project, path: declarationPath, identity }) => ({ project, path: declarationPath, identity })),
    capabilities: [{ project: 'demo', capability: 'demo.unit', outcome: 'passed', facts: ['Legacy unit passed.'] }],
    coverageGaps: [], conclusion: { outcome: 'passed', summary: 'Legacy verified.' }, completedAt: '2026-08-12T00:00:00.000Z',
  });
  const result = runtime.inspectTaskVerification(root, 'demo-task', { targetIdentity: 'target:legacy' });
  assert.equal(result.slot.result.schemaVersion, 'buildr.task-verification-result/v1');
  assert.equal(result.slot.applicability.status, 'unknown');
  assert.ok(result.slot.applicability.reasons.some((reason) => reason.code === 'legacy-result-candidate-unbound'));
});

test('Project Task repository仍拒绝空 declarations workspace shape', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  assert.throws(() => runtime.writeTaskVerificationResultPersistence(root, {
    schemaVersion: 'buildr.task-verification-result/v1', taskId: 'demo-task',
    target: { identity: 'workspace:forged', summary: 'Forged workspace target' }, declarations: [], capabilities: [],
    coverageGaps: [{ scope: 'workspace', summary: 'Must not bypass Project declarations.' }],
    conclusion: { outcome: 'not-passed', summary: 'Forged.' }, completedAt: '2026-08-12T00:00:00.000Z',
  }), (error) => error.code === 'task_verification_write_failed' && /有效 Project 集合/.test(error.message));
  assert.equal(runtime.inspectTaskVerification(root, 'demo-task').slot.present, false);
});
