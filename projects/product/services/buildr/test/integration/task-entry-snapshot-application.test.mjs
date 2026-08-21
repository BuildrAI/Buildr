import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { registerTaskEntrySnapshotApplication } from '../../src/application/task-entry/task-entry-snapshot-application.mjs';
import { resolveCapabilityRoute } from '../../src/infrastructure/runtime/skills/capabilities.mjs';

const taskId = 'entry-task';

function task(overrides = {}) {
  return {
    record: {
      taskId,
      status: 'active',
      intent: 'Reduce startup work.',
      scope: { projects: ['demo'], services: [{ project: 'demo', service: 'api' }] },
      changes: [{ project: 'demo', change: 'compact-entry' }],
      updatedAt: '2026-08-15T00:00:00.000Z',
      ...overrides,
    },
    recordDigest: `sha256-${'1'.repeat(64)}`,
  };
}

function execution(root, overrides = {}) {
  const environmentRoot = path.join(root, '.worktrees', taskId);
  return {
    ready: true,
    taskId,
    receiptSchema: 'buildr.task-environment-receipt/v6',
    workspaceRoot: root,
    environmentRoot,
    executionRoots: [environmentRoot, path.join(environmentRoot, 'projects', 'demo')],
    allowedExecutionRoots: [environmentRoot, path.join(environmentRoot, 'projects', 'demo')],
    controller: { identity: `sha256-${'2'.repeat(64)}`, adapter: 'codex' },
    runtimeInvocation: { kind: 'node', executable: '/retained/node', version: 'v24.15.0', identity: `sha256-${'8'.repeat(64)}`, searchPrefix: '/retained', source: 'stable-controller' },
    controllerInvocation: { command: '/retained/node', argsPrefix: ['/retained/buildr.mjs'], sourceRoot: '/retained/buildr', kind: 'stable-controller' },
    cliInvocation: { command: '/candidate/node', argsPrefix: ['/candidate/buildr.mjs'], sourceRoot: '/candidate/buildr', kind: 'task-environment-candidate' },
    observedAt: '2026-08-15T00:01:00.000Z',
    ...overrides,
  };
}

function development(next, overrides = {}) {
  const receipt = {
    taskContext: {
      identity: `sha256-${'3'.repeat(64)}`,
      taskId,
      intent: 'Reduce startup work.',
      scope: { projects: ['demo'], services: [{ project: 'demo', service: 'api' }] },
      changes: [{ project: 'demo', change: 'compact-entry', disposition: 'pending', summary: 'active' }],
    },
    environment: { taskId, receiptSchema: 'buildr.task-environment-receipt/v6' },
    planning: { identity: `sha256-${'4'.repeat(64)}`, targetIdentity: `sha256-${'5'.repeat(64)}` },
    contentTarget: null,
    verificationPolicy: null,
    candidate: null,
    generation: 0,
    gates: { planning: null, verification: null, completion: null },
    decision: null,
    handoffs: [],
    ...overrides.receipt,
  };
  const applicability = {
    status: 'planning', taskContext: 'current', planning: 'current', contentTarget: 'missing', policy: 'missing', candidate: 'missing', handoff: 'missing', gates: receipt.gates, reasons: [], ...overrides.applicability,
  };
  return {
    schemaVersion: 'buildr.task-development-operation-result/v1', operation: 'inspect', status: 'inspected', taskId,
    development: { receiptDigest: `sha256-${'6'.repeat(64)}`, observedAt: '2026-08-15T00:02:00.000Z', receipt, applicability },
    next, diagnostic: null, effects: [], nextActions: next ? [next.summary] : [],
  };
}

function route(capability, version, overrides = {}) {
  return { scope: 'projects/demo', capability, version, readiness: 'ready', reason: null, contract: { path: `skills/contracts/${capability}/v${version}.md`, digest: `sha256-${'7'.repeat(64)}` }, binding: { scope: '.', provider: capability.split('.').at(-1), provenance: 'workspace-default' }, selectedProvider: { id: capability.split('.').at(-1), scope: '.', runtimePath: `.agents/skills/${capability.split('.').at(-1)}/SKILL.md` }, ...overrides };
}

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-entry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = { task: 0, environment: 0, development: 0, parent: 0, capabilities: [] };
  const runtime = {
    inspectTaskRecord: () => { calls.task += 1; return options.task || task(); },
    resolveTaskEnvironmentExecution: () => { calls.environment += 1; return options.execution || execution(root); },
    inspectTaskDevelopmentCurrent: () => { calls.development += 1; return options.development || { schemaVersion: 'buildr.task-development-operation-result/v1', operation: 'inspect', status: 'missing', taskId, development: null, next: { mode: 'required', owner: 'task-development', action: 'begin', capability: { id: 'buildr.task-development', version: 2 }, summary: 'Begin Development.' }, diagnostic: null, effects: [], nextActions: ['Begin Development.'] }; },
    inspectParentStartupReadiness: () => { calls.parent += 1; return options.parentStartup; },
    resolveTaskEntryCapabilityRoute: (_root, _projects, capability, version) => { calls.capabilities.push(`${capability}@${version}`); return options.route || route(capability, version); },
  };
  registerTaskEntrySnapshotApplication(runtime);
  return { root, runtime, calls };
}

test('无Environment时短路到required Environment且零Development读取', (t) => {
  const { root, runtime, calls } = fixture(t, { execution: { ready: false, taskId, observedAt: null, blocked: { code: 'task_environment_no_receipt', message: 'No receipt.' } } });
  const result = runtime.inspectTaskEntrySnapshot(root, taskId);
  assert.equal(result.schemaVersion, 'buildr.task-entry-snapshot/v1');
  assert.equal(result.status, 'ready');
  assert.equal(result.next.mode, 'required');
  assert.equal(result.next.owner, 'task-environment');
  assert.deepEqual(result.effects, []);
  assert.deepEqual(calls, { task: 1, environment: 1, development: 0, parent: 0, capabilities: ['buildr.task-environment@1'] });
});

test('ready Environment直接给出execution root、retained controller与Development begin', (t) => {
  const { root, runtime } = fixture(t);
  const result = runtime.inspectTaskEntrySnapshot(root, taskId);
  assert.equal(result.environment.execution.workdir, path.join(root, '.worktrees', taskId));
  assert.equal(result.environment.controllerInvocation.kind, 'stable-controller');
  assert.equal(result.environment.cliInvocation.kind, 'task-environment-candidate');
  assert.equal(result.next.action, 'begin');
  assert.equal(result.next.command.writer, 'retained-controller');
  assert.equal(result.next.command.invocation.command, '/retained/node');
  assert.deepEqual(result.next.command.argv, [
    '/retained/buildr.mjs', '__internal', 'task-development', 'begin',
    '--task', taskId, '--target', root,
  ]);
});

test('Task Development后续动作均通过retained controller内部driver调用', (t) => {
  for (const action of ['planning', 'policy', 'freeze', 'decide', 'handoff']) {
    const next = { mode: 'recommended', owner: 'task-development', action, capability: { id: 'buildr.task-development', version: 2 }, summary: action };
    const { root, runtime } = fixture(t, { development: development(next) });
    const result = runtime.inspectTaskEntrySnapshot(root, taskId);
    assert.deepEqual(result.next.command.argv, [
      '/retained/buildr.mjs', '__internal', 'task-development', action,
      '--task', taskId, '--target', root,
    ]);
    assert.equal(result.next.command.argv.includes('/candidate/buildr.mjs'), false);
  }
});

test('Development compact只返回current facts并按next加载一个后续capability', (t) => {
  const next = { mode: 'recommended', owner: 'task-review', action: 'planning-review', capability: { id: 'buildr.task-review', version: 1 }, summary: 'Review planning.' };
  const { root, runtime, calls } = fixture(t, { development: development(next) });
  const result = runtime.inspectTaskEntrySnapshot(root, taskId);
  assert.equal(result.next.mode, 'recommended');
  assert.deepEqual(calls.capabilities, ['buildr.task-review@1']);
  assert.equal(result.development.receiptDigest, `sha256-${'6'.repeat(64)}`);
  assert.equal('receipt' in result.development, false);
  assert.equal(result.next.command.invocation.command, '/retained/node');
  assert.equal(result.next.command.argv.includes('/candidate/buildr.mjs'), false);
});

test('Parent Task Entry覆盖普通Development next并公开安全的Child前动作', (t) => {
  const parentPlanIdentity = `sha256-${'8'.repeat(64)}`;
  const parentStartup = {
    schemaVersion: 'buildr.parent-startup-readiness/v2', operation: 'inspect-startup', status: 'blocked', taskId, mode: 'parent-plan',
    checks: { task: 'ready', environment: 'ready', development: 'ready', parentPlan: 'ready', planningReview: 'ready', planningGate: 'missing' },
    blockers: [{ axis: 'planning-gate', code: 'parent_startup_review_not_consumed' }], eligibleContributions: [],
    next: { mode: 'recommended', owner: 'task-development', action: 'refresh-parent-planning', summary: 'Refresh Parent planning.' }, effects: [],
  };
  const ordinary = { mode: 'recommended', owner: 'agent', action: 'develop-and-observe', capability: null, summary: 'Develop.' };
  const current = fixture(t, { development: development(ordinary, { receipt: { parentPlan: { identity: parentPlanIdentity } } }), parentStartup });
  const result = current.runtime.inspectTaskEntrySnapshot(current.root, taskId);
  assert.equal(result.next.action, 'refresh-parent-planning');
  assert.equal(result.next.capability.id, 'buildr.task-development');
  assert.deepEqual(result.next.command.argv.slice(-7), ['task', 'parent', 'refresh-planning', taskId, '--target', current.root, '--json']);
  assert.equal(result.parent.status, 'blocked');
  assert.equal(result.development.identities.parentPlan, parentPlanIdentity);
  assert.equal(current.calls.parent, 1);
});

test('Parent Task Entry覆盖Planning Review、eligible Child与dependency wait且不预读后续owner', (t) => {
  const parentPlan = { identity: `sha256-${'8'.repeat(64)}` };
  const cases = [
    [{ status: 'blocked', checks: {}, blockers: [{ axis: 'planning-review', code: 'parent_startup_review_not_current' }], eligibleContributions: [], next: { mode: 'recommended', owner: 'task-review', action: 'planning-review', summary: 'Review.' } }, 'planning-review', 'buildr.task-review@1'],
    [{ status: 'ready', checks: {}, blockers: [], eligibleContributions: ['first-child'], next: { mode: 'recommended', owner: 'task-triage', action: 'start-child-contribution', contributionIds: ['first-child'], summary: 'Start Child.' } }, 'start-child-contribution', null],
    [{ status: 'blocked', checks: {}, blockers: [{ axis: 'contribution-dependency', code: 'parent_startup_contribution_dependency_incomplete' }], eligibleContributions: [], next: { mode: 'recommended', owner: 'agent', action: 'wait-contribution-dependencies', summary: 'Wait.' } }, 'wait-contribution-dependencies', null],
  ];
  for (const [projection, action, capability] of cases) {
    const parentStartup = { schemaVersion: 'buildr.parent-startup-readiness/v2', operation: 'inspect-startup', taskId, mode: 'parent-plan', effects: [], ...projection };
    const current = fixture(t, { development: development({ mode: 'recommended', owner: 'agent', action: 'develop-and-observe', capability: null, summary: 'Develop.' }, { receipt: { parentPlan } }), parentStartup });
    const result = current.runtime.inspectTaskEntrySnapshot(current.root, taskId);
    assert.equal(result.next.action, action);
    assert.deepEqual(current.calls.capabilities, capability ? [capability] : []);
    assert.equal(current.calls.parent, 1);
  }
});

test('ordinary Task不读取Parent Coordination', (t) => {
  const current = fixture(t, { development: development({ mode: 'recommended', owner: 'agent', action: 'develop-and-observe', capability: null, summary: 'Develop.' }) });
  const result = current.runtime.inspectTaskEntrySnapshot(current.root, taskId);
  assert.equal(result.parent, null);
  assert.equal(current.calls.parent, 0);
});

test('Task与Environment identity stale均fail closed并给出精确owner', (t) => {
  const next = { mode: 'recommended', owner: 'agent', action: 'develop-and-observe', capability: null, summary: 'Develop.' };
  const staleTask = fixture(t, { task: task({ intent: 'Changed intent.' }), development: development(next) });
  const taskResult = staleTask.runtime.inspectTaskEntrySnapshot(staleTask.root, taskId);
  assert.equal(taskResult.status, 'blocked');
  assert.equal(taskResult.next.mode, 'required');
  assert.equal(taskResult.next.owner, 'task-development');
  assert.equal(taskResult.next.action, 'planning');

  const staleEnvironment = fixture(t, { development: development(next, { receipt: { environment: { taskId, receiptSchema: 'buildr.task-environment-receipt/v4' } } }) });
  const environmentResult = staleEnvironment.runtime.inspectTaskEntrySnapshot(staleEnvironment.root, taskId);
  assert.equal(environmentResult.status, 'blocked');
  assert.equal(environmentResult.next.mode, 'required');
  assert.equal(environmentResult.next.action, 'begin');
});

test('显式target mismatch不搜索其他worktree且不读取Development', (t) => {
  const { root, runtime, calls } = fixture(t);
  const result = runtime.inspectTaskEntrySnapshot(root, taskId, { executionTarget: path.join(root, 'other-worktree') });
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'task_entry_execution_target_mismatch');
  assert.equal(result.diagnostic.owner, 'task-environment');
  assert.equal(calls.development, 0);
  assert.deepEqual(result.effects, []);
});

test('capability route失败转为required且只暴露当前identity', (t) => {
  const next = { mode: 'recommended', owner: 'task-verification', action: 'verify', capability: { id: 'buildr.task-verification', version: 3 }, summary: 'Verify.' };
  const { root, runtime } = fixture(t, { development: development(next), route: route('buildr.task-verification', 3, { readiness: 'blocked', reason: 'invalid_binding', selectedProvider: null }) });
  const result = runtime.inspectTaskEntrySnapshot(root, taskId);
  assert.equal(result.status, 'blocked');
  assert.equal(result.next.mode, 'required');
  assert.equal(result.next.route.capability, 'buildr.task-verification');
  assert.equal('contracts' in result.next.route, false);
  assert.equal('candidates' in result.next.route, false);
});

test('profile只增加本次可观察事实且不改变决策', (t) => {
  const { root, runtime } = fixture(t);
  const ordinary = runtime.inspectTaskEntrySnapshot(root, taskId);
  const profiled = runtime.inspectTaskEntrySnapshot(root, taskId, { profile: true });
  assert.equal('profile' in ordinary, false);
  assert.equal(Number.isFinite(profiled.profile.wallClockMs), true);
  assert.deepEqual(profiled.profile.ownerReads.map(({ owner, calls }) => ({ owner, calls })), [{ owner: 'task-manager', calls: 1 }, { owner: 'task-environment', calls: 1 }, { owner: 'task-development', calls: 1 }, { owner: 'capability-routing', calls: 1 }]);
  const { profile, ...withoutProfile } = profiled;
  assert.deepEqual(withoutProfile, ordinary);
  assert.deepEqual(profile.attempts, { failed: 0, repeated: 0, blocked: 0 });
});

test('Review、Verification与Finish只在成为next时出现', (t) => {
  const cases = [
    ['buildr.task-review', 1, 'planning-review'],
    ['buildr.current-knowledge-maintenance', 2, 'inspect'],
    ['buildr.task-verification', 3, 'verify'],
    ['buildr.task-finish', 1, 'finish'],
  ];
  for (const [capability, version, action] of cases) {
    const next = { mode: 'recommended', owner: capability.split('.').at(-1), action, capability: { id: capability, version }, summary: action };
    const { root, runtime, calls } = fixture(t, { development: development(next) });
    runtime.inspectTaskEntrySnapshot(root, taskId);
    assert.deepEqual(calls.capabilities, [`${capability}@${version}`]);
  }
});

test('cross-Project provider不一致时targeted route fail closed', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-entry-capability-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sections = ['Purpose', 'Consumer Obligations', 'Minimum Guarantees', 'Effects and Authorization', 'Result Evidence', 'Decision Points', 'Allowed Variations'];
  fs.mkdirSync(path.join(root, 'skills', 'contracts', 'example'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'contracts', 'example', 'route.md'), ['---', 'schemaVersion: buildr.capability-contract/v1', 'id: example.route', 'version: 1', '---', '', '# Route', '', ...sections.flatMap((section) => [`## ${section}`, '', `${section}.`, ''])].join('\n'));
  for (const provider of ['provider-one', 'provider-two']) {
    fs.mkdirSync(path.join(root, 'skills', provider), { recursive: true });
    fs.writeFileSync(path.join(root, 'skills', provider, 'SKILL.md'), `---\nname: ${provider}\ndescription: ${provider}\n---\n# ${provider}\n`);
  }
  fs.writeFileSync(path.join(root, 'skills', 'manifest.yml'), YAML.stringify({
    schemaVersion: 'buildr.skills/v2',
    contracts: [{ id: 'example.route', version: 1, path: 'contracts/example/route.md', description: 'route fixture' }],
    bindings: [],
    skills: ['provider-one', 'provider-two'].map((id) => ({ id, path: id, provides: [{ capability: 'example.route', version: 1 }] })),
  }));
  for (const [project, provider] of [['one', 'provider-one'], ['two', 'provider-two']]) {
    fs.mkdirSync(path.join(root, 'projects', project), { recursive: true });
    fs.writeFileSync(path.join(root, 'projects', project, 'capabilities.yml'), YAML.stringify({ schemaVersion: 'buildr.project-capabilities/v1', requires: [], bindings: [{ capability: 'example.route', version: 1, provider }], skills: [] }));
  }
  const result = resolveCapabilityRoute(root, ['one', 'two'], 'example.route', 1, { runtime: 'codex' });
  assert.equal(result.readiness, 'blocked');
  assert.equal(result.reason, 'cross_project_binding_ambiguous');
  assert.equal(result.selectedProvider, null);
  assert.equal('graphs' in result, false);
  assert.equal('candidates' in result, false);
});
