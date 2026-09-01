import assert from 'node:assert/strict';
import test from 'node:test';

import { compactReleaseOrchestration, inspectReleaseOrchestration, resolveRetainedController, runReleaseOrchestration } from '../../tools/release/release-orchestration-runner.mjs';

const digest = (letter) => `sha256-${letter.repeat(64)}`;
const commit = (letter) => letter.repeat(40);

function context() {
  return {
    schemaVersion: 'buildr.release-context/v1',
    identity: digest('1'),
    selection: { status: 'frozen', generation: 2, identity: digest('2') },
    release: { version: '1.0.0-rc.1', sourceCommit: commit('a'), sourceTree: commit('b') },
    candidate: { status: 'passed', runId: 42, runAttempt: 2, aggregateIdentity: digest('3') },
    convergence: { mainCommit: commit('a') },
    environment: { taskId: 'release-1.0.0-rc.1' },
  };
}

function evidence() {
  return {
    status: 'passed',
    identity: digest('4'),
    context: context(),
    publish: { runId: 84, runAttempt: 1 },
    observedAt: '2026-08-25T01:00:00.000Z',
  };
}

function closeoutDependencies(overrides = {}) {
  let task = { taskId: 'release-1.0.0-rc.1', status: 'active', result: null };
  let environmentStatus = 'ready';
  let gitCloseoutInput = null;
  const calls = [];
  const dependencies = {
    inspectHostedReleaseTransaction: async () => ({ status: 'passed', evidenceIdentity: digest('4'), evidence: evidence(), effects: [], nextActions: [] }),
    reconcilePublishedReleaseWithDev: () => ({ status: 'passed', identity: digest('5'), recoveryIdentity: digest('6'), effects: [], nextActions: [] }),
    closeoutReleaseGitResources: (input) => {
      gitCloseoutInput = input;
      return { status: 'passed', identity: digest('7'), formalReleaseRef: { disposition: 'retained-and-verified', ref: 'refs/heads/release-1.0.0-rc.1' }, effects: [{ type: 'selection-cleaned' }], nextActions: [] };
    },
    inspectTaskRecord: () => ({ record: task, recordDigest: digest(task.status === 'active' ? '8' : '9') }),
    inspectTaskEnvironment: () => ({ status: environmentStatus, environment: { workspace: { root: '/workspace' }, controller: { sourceRoot: '/workspace/projects/product/services/buildr', identity: digest('a') }, runtimeInvocation: { executable: '/node' } } }),
    resolveRetainedController: () => ({ executable: '/node', argsPrefix: ['/workspace/projects/product/services/buildr/bin/buildr.mjs'], workspaceRoot: '/workspace' }),
    invokeRetainedController: (_controller, args) => {
      calls.push(args);
      if (args[0] === 'task' && args[1] === 'complete') {
        task = { ...task, status: 'completed', result: { summary: 'done', noChange: true } };
        return { status: 'completed', recordDigest: digest('9'), effects: [{ type: 'task-completed' }], nextActions: [] };
      }
      if (args[0] === 'task' && args[1] === 'environment') {
        environmentStatus = 'cleaned';
        return { status: 'cleaned', effects: [{ type: 'environment-cleaned' }], nextActions: [] };
      }
      return { status: 'ready', identity: digest('b'), effects: [], nextActions: [] };
    },
    ...overrides,
  };
  return { dependencies, calls, getTask: () => task, getGitCloseoutInput: () => gitCloseoutInput, setTask: (value) => { task = value; }, setEnvironmentStatus: (value) => { environmentStatus = value; } };
}

test('prepare-dispatch has no effects and returns the unique current approval request', async () => {
  const current = context();
  const value = await runReleaseOrchestration({ action: 'prepare-dispatch', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', transaction: {} }, {
    runHostedReleaseTransaction: async (options) => ({ action: options.action, status: 'ready', context: current, contextIdentity: current.identity, effects: [], nextActions: [] }),
  });
  assert.equal(value.status, 'awaiting-publication-authorization');
  assert.equal(value.contextIdentity, current.identity);
  assert.deepEqual(value.effects, []);
  assert.equal(value.timeline.phases.find((item) => item.id === 'publication-authorization').waitType, 'human-decision');
});

test('dispatch rechecks current context before invoking the protected transaction owner', async () => {
  const current = context();
  let calls = 0;
  const runHostedReleaseTransaction = async (options) => {
    calls += 1;
    if (options.action === 'readiness') return { status: 'ready', context: current, contextIdentity: current.identity, effects: [], nextActions: [] };
    return { status: 'passed', context: current, contextIdentity: current.identity, evidence: { identity: digest('4'), observedAt: '2026-08-25T01:00:00.000Z' }, effects: [{ type: 'workflow-dispatched' }], nextActions: [] };
  };
  const drifted = await runReleaseOrchestration({ action: 'dispatch', version: '1.0.0-rc.1', transaction: {}, publicationAuthorized: true, expectedContextDigest: digest('f') }, { runHostedReleaseTransaction });
  assert.equal(drifted.status, 'blocked');
  assert.equal(calls, 1);
  assert.deepEqual(drifted.effects, []);
  const passed = await runReleaseOrchestration({ action: 'dispatch', version: '1.0.0-rc.1', transaction: {}, publicationAuthorized: true, expectedContextDigest: current.identity }, { runHostedReleaseTransaction });
  assert.equal(passed.status, 'passed');
  assert.equal(calls, 3);
  assert.deepEqual(passed.effects, [{ type: 'workflow-dispatched' }]);
});

test('closeout completes every owner in order and emits compact timeline output', async () => {
  const fixture = closeoutDependencies();
  const value = await runReleaseOrchestration({
    action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84,
    repo: '/workspace', canonicalWorkspace: '/workspace', authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true,
    candidateAttempts: [{ runId: 42, runAttempt: 1, status: 'failed', rerunScope: ['windows'], evidence: [] }, { runId: 42, runAttempt: 2, status: 'passed', rerunScope: ['windows'], aggregateIdentity: digest('3'), evidence: [{ id: 'macos', disposition: 'reused', originRunId: 42, originRunAttempt: 1, identity: digest('c') }] }],
  }, fixture.dependencies);
  assert.equal(value.status, 'passed');
  assert.equal(fixture.getTask().result.noChange, true);
  assert.equal(fixture.getGitCloseoutInput().publicationEvidence.identity, digest('4'));
  assert.ok(fixture.calls[0].includes('--expected-record'));
  assert.deepEqual(fixture.calls[1].slice(4, 8), ['--expected-source', `workspace=${commit('a')}`, '--delivered-ref', `workspace=${commit('a')}`]);
  assert.deepEqual(fixture.calls.map((args) => args.slice(0, 3)), [['task', 'complete', 'release-1.0.0-rc.1'], ['task', 'environment', 'cleanup'], ['doctor', '--target', '/workspace']]);
  assert.equal(value.lifecycle.phase, 'closed');
  assert.equal(value.timeline.terminalStatus, 'closed');
  assert.equal(value.timeline.phases.find((item) => item.id === 'candidate-attempt:42:2').attempt.evidence[0].disposition, 'reused');
  const compact = compactReleaseOrchestration(value);
  assert.equal(compact.timeline.timelineIdentity, value.timelineIdentity);
  assert.equal('context' in compact, false);
  assert.equal(inspectReleaseOrchestration(value, value.timelineIdentity), value);
  assert.throws(() => inspectReleaseOrchestration(value, digest('f')), /does not match/u);
});

test('closeout accepts the official Doctor ok and health.ready contract', async () => {
  const fixture = closeoutDependencies();
  const invoke = fixture.dependencies.invokeRetainedController;
  fixture.dependencies.invokeRetainedController = (controller, args) => {
    if (args[0] === 'doctor') return { ok: true, health: { ready: true }, findings: [], effects: [], nextActions: [] };
    return invoke(controller, args);
  };
  const value = await runReleaseOrchestration({
    action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84,
    repo: '/workspace', canonicalWorkspace: '/workspace', authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true,
  }, fixture.dependencies);
  assert.equal(value.status, 'passed');
  assert.equal(value.lifecycle.phase, 'closed');
  assert.equal(value.steps.find((item) => item.owner === 'doctor').status, 'ready');
  assert.equal(value.timeline.phases.find((item) => item.id === 'doctor').status, 'passed');
  assert.equal(value.timeline.terminalStatus, 'closed');
});

test('terminal Task resume continues cleanup without repeating Task completion', async () => {
  const fixture = closeoutDependencies();
  let cleanupAttempts = 0;
  const baseInvoke = fixture.dependencies.invokeRetainedController;
  fixture.dependencies.invokeRetainedController = (controller, args) => {
    if (args[0] === 'task' && args[1] === 'environment') {
      cleanupAttempts += 1;
      if (cleanupAttempts === 1) return { status: 'blocked', effects: [], nextActions: ['restore cleanup'] };
    }
    return baseInvoke(controller, args);
  };
  const options = { action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84, repo: '/workspace', canonicalWorkspace: '/workspace', authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true };
  const first = await runReleaseOrchestration(options, fixture.dependencies);
  assert.equal(first.status, 'blocked');
  assert.equal(fixture.getTask().status, 'completed');
  const second = await runReleaseOrchestration(options, fixture.dependencies);
  assert.equal(second.status, 'passed');
  assert.equal(fixture.calls.filter((args) => args[0] === 'task' && args[1] === 'complete').length, 1);
});

test('cleanup authorization blocker stops before canonical Task mutation', async () => {
  const fixture = closeoutDependencies({ closeoutReleaseGitResources: () => ({ status: 'blocked', effects: [], nextActions: ['authorize cleanup'] }) });
  const value = await runReleaseOrchestration({ action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84, repo: '/workspace', canonicalWorkspace: '/workspace' }, fixture.dependencies);
  assert.equal(value.status, 'blocked');
  assert.deepEqual(fixture.calls, []);
  assert.equal(fixture.getTask().status, 'active');
});

test('retained controller resolver rejects candidate worktree source before canonical mutation', async () => {
  const fixture = closeoutDependencies();
  fixture.dependencies.resolveRetainedController = resolveRetainedController;
  fixture.dependencies.inspectTaskEnvironment = () => ({ status: 'ready', environment: { workspace: { root: '/workspace' }, controller: { sourceRoot: '/workspace/.worktrees/release/projects/product/services/buildr', identity: digest('a') }, runtimeInvocation: { executable: '/node' } } });
  const value = await runReleaseOrchestration({ action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84, repo: '/workspace', canonicalWorkspace: '/workspace', authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true }, fixture.dependencies);
  assert.equal(value.status, 'blocked');
  assert.match(value.nextActions[0], /retained controller/u);
  assert.deepEqual(fixture.calls, []);
});

test('merge-to-dispatch and post-Publication closeout recover as one end-to-end orchestration path', async () => {
  const current = context();
  let protectedDispatches = 0;
  const runHostedReleaseTransaction = async (options) => {
    if (options.action === 'readiness') return { status: 'ready', context: current, contextIdentity: current.identity, effects: [], nextActions: [] };
    protectedDispatches += 1;
    return { status: 'passed', context: current, contextIdentity: current.identity, evidence: evidence(), effects: [{ type: 'workflow-dispatched', runId: 84 }], nextActions: [] };
  };
  const prepared = await runReleaseOrchestration({ action: 'prepare-dispatch', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', transaction: {} }, { runHostedReleaseTransaction });
  assert.equal(prepared.status, 'awaiting-publication-authorization');
  assert.equal(prepared.contextIdentity, current.identity);
  assert.deepEqual(prepared.effects, []);

  const dispatched = await runReleaseOrchestration({ action: 'dispatch', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', transaction: {}, publicationAuthorized: true, expectedContextDigest: prepared.contextIdentity }, { runHostedReleaseTransaction });
  assert.equal(dispatched.status, 'passed');
  assert.equal(protectedDispatches, 1);
  assert.deepEqual(dispatched.effects, [{ type: 'workflow-dispatched', runId: 84 }]);

  const fixture = closeoutDependencies();
  let cleanupAttempts = 0;
  const invoke = fixture.dependencies.invokeRetainedController;
  fixture.dependencies.invokeRetainedController = (controller, args) => {
    if (args[0] === 'task' && args[1] === 'environment' && ++cleanupAttempts === 1) return { status: 'blocked', effects: [], nextActions: ['restore cleanup'] };
    return invoke(controller, args);
  };
  const closeoutOptions = {
    action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84,
    repo: '/workspace', canonicalWorkspace: '/workspace', authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true,
  };
  const interrupted = await runReleaseOrchestration(closeoutOptions, fixture.dependencies);
  assert.equal(interrupted.status, 'blocked');
  assert.equal(fixture.getTask().result.noChange, true);
  const closed = await runReleaseOrchestration(closeoutOptions, fixture.dependencies);
  assert.equal(closed.status, 'passed');
  assert.equal(closed.lifecycle.phase, 'closed');
  assert.equal(closed.timeline.terminalStatus, 'closed');
  assert.equal(protectedDispatches, 1);
  assert.equal(fixture.calls.filter((args) => args[0] === 'task' && args[1] === 'complete').length, 1);
});
