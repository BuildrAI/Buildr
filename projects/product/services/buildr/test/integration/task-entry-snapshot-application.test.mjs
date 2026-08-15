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
    receiptSchema: 'buildr.task-environment-receipt/v5',
    workspaceRoot: root,
    environmentRoot,
    executionRoots: [environmentRoot, path.join(environmentRoot, 'projects', 'demo')],
    allowedExecutionRoots: [environmentRoot, path.join(environmentRoot, 'projects', 'demo')],
    controller: { identity: `sha256-${'2'.repeat(64)}`, adapter: 'codex' },
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
    environment: { taskId, receiptSchema: 'buildr.task-environment-receipt/v5' },
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
  const calls = { task: 0, environment: 0, development: 0, capabilities: [] };
  const runtime = {
    inspectTaskRecord: () => { calls.task += 1; return options.task || task(); },
    resolveTaskEnvironmentExecution: () => { calls.environment += 1; return options.execution || execution(root); },
    inspectTaskDevelopmentCurrent: () => { calls.development += 1; return options.development || { schemaVersion: 'buildr.task-development-operation-result/v1', operation: 'inspect', status: 'missing', taskId, development: null, next: { mode: 'required', owner: 'task-development', action: 'begin', capability: { id: 'buildr.task-development', version: 2 }, summary: 'Begin Development.' }, diagnostic: null, effects: [], nextActions: ['Begin Development.'] }; },
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
  assert.deepEqual(calls, { task: 1, environment: 1, development: 0, capabilities: ['buildr.task-environment@1'] });
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
