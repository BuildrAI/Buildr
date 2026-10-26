import assert from 'node:assert/strict';
import test from 'node:test';

import { compactReleaseOrchestration, inspectReleaseOrchestration, runReleaseOrchestration } from '../../../../../../skills/buildr-release/scripts/release-orchestration-runner.ts';

const digest: any = (letter: any) => `sha256-${letter.repeat(64)}`;
const commit: any = (letter: any) => letter.repeat(40);

function context(): any  {
  return {
    schemaVersion: 'buildr.release-context/v2',
    identity: digest('1'),
    selection: { status: 'frozen', generation: 2, identity: digest('2') },
    release: { version: '1.0.0-rc.1', sourceCommit: commit('a'), sourceTree: commit('b') },
    candidate: { status: 'passed', runId: 42, runAttempt: 2, aggregateIdentity: digest('3') },
    convergence: { mainCommit: commit('a') },
    preparation: { taskId: 'release-1.0.0-rc.1' },
  };
}

function evidence(): any  {
  return {
    status: 'passed',
    identity: digest('4'),
    context: context(),
    publish: { runId: 84, runAttempt: 1 },
    observedAt: '2026-08-25T01:00:00.000Z',
  };
}

function closeoutDependencies(overrides: any = {}): any  {
  let task: any = { taskId: 'release-1.0.0-rc.1', status: 'active', result: null };
  let gitCloseoutInput: any = null;
  const calls: any[] = [];
  const dependencies: any = {
    inspectHostedReleaseTransaction: async () => ({ status: 'passed', evidenceIdentity: digest('4'), evidence: evidence(), effects: [], nextActions: [] }),
    reconcilePublishedReleaseWithDev: () => ({ status: 'passed', identity: digest('5'), recoveryIdentity: digest('6'), effects: [], nextActions: [] }),
    closeoutReleaseGitResources: (input: any) => {
      gitCloseoutInput = input;
      return { status: 'passed', identity: digest('7'), formalReleaseRef: { disposition: 'retained-and-verified', ref: 'refs/heads/release-1.0.0-rc.1' }, effects: [{ type: 'selection-cleaned' }], nextActions: [] };
    },
    inspectTask: () => ({ record: task, recordDigest: digest(task.status === 'active' ? '8' : '9') }),
    resolveRetainedController: () => ({ executable: '/node', argsPrefix: ['/workspace/projects/product/services/buildr/bin/buildr.mjs'], workspaceRoot: '/workspace' }),
    invokeRetainedController: (_controller: any, args: any) => {
      calls.push(args);
      if (args[0] === 'task' && args[1] === 'complete') {
        task = { ...task, status: 'completed', result: { summary: 'done' } };
        return { status: 'completed', recordDigest: digest('9'), effects: [{ type: 'task-completed' }], nextActions: [] };
      }
      if (args[0] === 'worktree' && args[1] === 'cleanup') {
        return { status: 'cleaned', effects: [{ type: 'worktree-cleaned' }], nextActions: [] };
      }
      return { status: 'ready', identity: digest('b'), effects: [], nextActions: [] };
    },
    selfBootstrapCloseout: async () => ({ status: 'passed', effects: [], nextActions: [] }),
    ...overrides,
  };
  return { dependencies, calls, getTask: () => task, getGitCloseoutInput: () => gitCloseoutInput, setTask: (value: any) => { task = value; } };
}

test('prepare-dispatch has no effects and returns the unique current approval request', async () => {
  const current: any = context();
  const value: any = await runReleaseOrchestration({ action: 'prepare-dispatch', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', transaction: {} }, {
    runHostedReleaseTransaction: async (options: any) => ({ action: options.action, status: 'ready', context: current, contextIdentity: current.identity, effects: [], nextActions: [] }),
  });
  assert.equal(value.status, 'awaiting-publication-authorization');
  assert.equal(value.contextIdentity, current.identity);
  assert.deepEqual(value.effects, []);
  assert.equal(value.timeline.phases.find((item: any) => item.id === 'publication-authorization').waitType, 'human-decision');
});

test('dispatch rechecks current context before invoking the protected transaction owner', async () => {
  const current: any = context();
  let calls: any = 0;
  const runHostedReleaseTransaction: any = async (options: any) => {
    calls += 1;
    if (options.action === 'readiness') return { status: 'ready', context: current, contextIdentity: current.identity, effects: [], nextActions: [] };
    return { status: 'passed', context: current, contextIdentity: current.identity, evidence: { identity: digest('4'), observedAt: '2026-08-25T01:00:00.000Z' }, effects: [{ type: 'workflow-dispatched' }], nextActions: [] };
  };
  const drifted: any = await runReleaseOrchestration({ action: 'dispatch', version: '1.0.0-rc.1', transaction: {}, publicationAuthorized: true, expectedContextDigest: digest('f') }, { runHostedReleaseTransaction });
  assert.equal(drifted.status, 'blocked');
  assert.equal(calls, 1);
  assert.deepEqual(drifted.effects, []);
  const passed: any = await runReleaseOrchestration({ action: 'dispatch', version: '1.0.0-rc.1', transaction: {}, publicationAuthorized: true, expectedContextDigest: current.identity }, { runHostedReleaseTransaction });
  assert.equal(passed.status, 'passed');
  assert.equal(calls, 3);
  assert.deepEqual(passed.effects, [{ type: 'workflow-dispatched' }]);
});

test('closeout completes every owner in order and emits compact timeline output', async () => {
  const fixture: any = closeoutDependencies();
  const value: any = await runReleaseOrchestration({
    action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84,
    repo: '/workspace', canonicalWorkspace: '/workspace', authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true,
    candidateAttempts: [{ runId: 42, runAttempt: 1, status: 'failed', rerunScope: ['windows'], evidence: [] }, { runId: 42, runAttempt: 2, status: 'passed', rerunScope: ['windows'], aggregateIdentity: digest('3'), evidence: [{ id: 'macos', disposition: 'reused', originRunId: 42, originRunAttempt: 1, identity: digest('c') }] }],
  }, fixture.dependencies);
  assert.equal(value.status, 'passed');
  assert.deepEqual(fixture.getTask().result, { summary: 'done' });
  assert.equal(fixture.calls[0].includes('--no-change'), false);
  assert.equal(fixture.getGitCloseoutInput().publicationEvidence.identity, digest('4'));
  assert.ok(fixture.calls[0].includes('--expected-record'));
  assert.deepEqual(fixture.calls[1].slice(3, 7), ['--expected-source', `workspace=${commit('a')}`, '--delivered-ref', `workspace=${commit('a')}`]);
  assert.deepEqual(fixture.calls.map((args: any) => args.slice(0, 3)), [['task', 'complete', 'release-1.0.0-rc.1'], ['worktree', 'cleanup', 'release-1.0.0-rc.1']]);
  assert.equal(value.lifecycle.phase, 'closed');
  assert.equal(value.timeline.terminalStatus, 'closed');
  assert.equal(value.timeline.phases.find((item: any) => item.id === 'candidate-attempt:42:2').attempt.evidence[0].disposition, 'reused');
  const compact: any = compactReleaseOrchestration(value);
  assert.equal(compact.timeline.timelineIdentity, value.timelineIdentity);
  assert.equal('context' in compact, false);
  assert.equal(inspectReleaseOrchestration(value, value.timelineIdentity), value);
  assert.throws(() => inspectReleaseOrchestration(value, digest('f')), /does not match/u);
});

test('release closeout is independent of developer activation and reuses completed effects', async () => {
  const fixture: any = closeoutDependencies({ selfBootstrapCloseout: () => assert.fail('release must not activate the developer app') });
  const options = {
    action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84,
    repo: '/workspace', canonicalWorkspace: '/workspace', authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true,
  };
  const completed = await runReleaseOrchestration(options, fixture.dependencies);
  assert.equal(completed.status, 'passed');
  assert.deepEqual(completed.outcomes, { publication: 'passed', taskRegistration: 'completed', cleanup: 'cleaned', activation: 'not-run' });
  assert.equal(completed.timeline.terminalStatus, 'closed');
  assert.equal(completed.timeline.phases.some((item: any) => item.id === 'self-bootstrap-activation'), false);
  fixture.dependencies.closeoutReleaseGitResources = () => assert.fail('completed Git cleanup cannot repeat');
  fixture.dependencies.invokeRetainedController = () => assert.fail('completed Task and worktree cleanup cannot repeat');
  const resumed = await runReleaseOrchestration({ ...options, closeoutProgress: {
    ...completed.closeoutProgress, selfBootstrapCloseout: { status: 'blocked', effects: [] },
  } }, fixture.dependencies);
  assert.equal(resumed.status, 'passed');
  assert.equal(resumed.outcomes.activation, 'not-run');
  assert.deepEqual(resumed.effects, []);
});

test('terminal Task resume continues cleanup without repeating Task completion', async () => {
  const fixture: any = closeoutDependencies();
  let cleanupAttempts: any = 0;
  const baseInvoke: any = fixture.dependencies.invokeRetainedController;
  fixture.dependencies.invokeRetainedController = (controller: any, args: any) => {
    if (args[0] === 'worktree' && args[1] === 'cleanup') {
      cleanupAttempts += 1;
      if (cleanupAttempts === 1) return { status: 'blocked', effects: [], nextActions: ['restore cleanup'] };
    }
    return baseInvoke(controller, args);
  };
  const options: any = { action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84, repo: '/workspace', canonicalWorkspace: '/workspace', authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true };
  const first: any = await runReleaseOrchestration(options, fixture.dependencies);
  assert.equal(first.status, 'blocked');
  assert.equal(fixture.getTask().status, 'completed');
  const second: any = await runReleaseOrchestration(options, fixture.dependencies);
  assert.equal(second.status, 'passed');
  assert.equal(fixture.calls.filter((args: any) => args[0] === 'task' && args[1] === 'complete').length, 1);
});

test('cleanup authorization blocker stops before canonical Task mutation', async () => {
  const fixture: any = closeoutDependencies({ closeoutReleaseGitResources: () => ({ status: 'blocked', effects: [], nextActions: ['authorize cleanup'] }) });
  const value: any = await runReleaseOrchestration({ action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84, repo: '/workspace', canonicalWorkspace: '/workspace' }, fixture.dependencies);
  assert.equal(value.status, 'blocked');
  assert.deepEqual(fixture.calls, []);
  assert.equal(fixture.getTask().status, 'active');
});

test('compact closeout keeps per-branch retained and already-cleaned results after partial cleanup', async () => {
  const branches = [{ ref: 'refs/heads/codex/release-main-1.0.0-rc.1-g1', disposition: 'retained', reason: 'active run' },
    { ref: 'refs/heads/release-1.0.0-rc.1', disposition: 'already-cleaned' }];
  const fixture = closeoutDependencies({ closeoutReleaseGitResources: () => ({ status: 'blocked', branches,
    findings: [{ ref: branches[0].ref, message: 'active run' }], effects: [], nextActions: ['wait for active run'] }) });
  const closed = await runReleaseOrchestration({ action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84 }, fixture.dependencies);
  assert.equal(closed.outcomes.publication, 'passed');
  assert.deepEqual(compactReleaseOrchestration(closed).cleanup.branches, branches);
  assert.equal(compactReleaseOrchestration(closed).cleanup.findings.length, 1);
});

test('closeout rejects a different publication context before Git cleanup', async () => {
  const fixture = closeoutDependencies();
  const value = await runReleaseOrchestration({ action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1',
    publishRunId: 84, expectedContextDigest: digest('f'), authorizeRemoteDelete: true }, fixture.dependencies);
  assert.equal(value.status, 'blocked');
  assert.equal(value.outcomes.publication, 'passed');
  assert.equal(fixture.getGitCloseoutInput(), null);
  assert.deepEqual(fixture.calls, []);
});

test('merge-to-dispatch and post-Publication closeout recover as one end-to-end orchestration path', async () => {
  const current: any = context();
  let protectedDispatches: any = 0;
  const runHostedReleaseTransaction: any = async (options: any) => {
    if (options.action === 'readiness') return { status: 'ready', context: current, contextIdentity: current.identity, effects: [], nextActions: [] };
    protectedDispatches += 1;
    return { status: 'passed', context: current, contextIdentity: current.identity, evidence: evidence(), effects: [{ type: 'workflow-dispatched', runId: 84 }], nextActions: [] };
  };
  const prepared: any = await runReleaseOrchestration({ action: 'prepare-dispatch', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', transaction: {} }, { runHostedReleaseTransaction });
  assert.equal(prepared.status, 'awaiting-publication-authorization');
  assert.equal(prepared.contextIdentity, current.identity);
  assert.deepEqual(prepared.effects, []);

  const dispatched: any = await runReleaseOrchestration({ action: 'dispatch', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', transaction: {}, publicationAuthorized: true, expectedContextDigest: prepared.contextIdentity }, { runHostedReleaseTransaction });
  assert.equal(dispatched.status, 'passed');
  assert.equal(protectedDispatches, 1);
  assert.deepEqual(dispatched.effects, [{ type: 'workflow-dispatched', runId: 84 }]);

  const fixture: any = closeoutDependencies();
  let cleanupAttempts: any = 0;
  const invoke: any = fixture.dependencies.invokeRetainedController;
  fixture.dependencies.invokeRetainedController = (controller: any, args: any) => {
    if (args[0] === 'worktree' && args[1] === 'cleanup' && ++cleanupAttempts === 1) return { status: 'blocked', effects: [], nextActions: ['restore cleanup'] };
    return invoke(controller, args);
  };
  const closeoutOptions: any = {
    action: 'closeout', version: '1.0.0-rc.1', releaseTask: 'release-1.0.0-rc.1', publishRunId: 84,
    repo: '/workspace', canonicalWorkspace: '/workspace', authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true,
  };
  const interrupted: any = await runReleaseOrchestration(closeoutOptions, fixture.dependencies);
  assert.equal(interrupted.status, 'blocked');
  assert.deepEqual(fixture.getTask().result, { summary: 'done' });
  const closed: any = await runReleaseOrchestration(closeoutOptions, fixture.dependencies);
  assert.equal(closed.status, 'passed');
  assert.equal(closed.lifecycle.phase, 'closed');
  assert.equal(closed.timeline.terminalStatus, 'closed');
  assert.equal(protectedDispatches, 1);
  assert.equal(fixture.calls.filter((args: any) => args[0] === 'task' && args[1] === 'complete').length, 1);
});

test('continuous release waits internally for one request, resumes public work and stops on all real blockers', async () => {
  const { runReleaseOperationUntilSettled } = await import('../../../../../../skills/buildr-release/scripts/release-orchestration-runner.ts');
  const actions: string[] = [], progress: string[] = [];
  let now = 0;
  const statuses = ['publication-dispatch-unconfirmed', 'publication-running', 'publication-running', 'passed'];
  const value = await runReleaseOperationUntilSettled({ action: 'publish', wait: true, waitIntervalMs: 10, waitTimeoutMs: 100 }, {
    now: () => now, sleep: async (ms: number) => { now += ms; },
    onProgress: (event: any) => progress.push(event.status),
    runReleaseOperation: async (options: any) => { actions.push(options.action); return { status: statuses.shift(), effects: actions.length === 1 ? [{ type: 'requested' }] : [] }; },
  });
  assert.deepEqual(actions, ['publish', 'resume', 'resume', 'resume']);
  assert.deepEqual(progress, ['publication-dispatch-unconfirmed', 'publication-running', 'passed']);
  assert.deepEqual(value.effects, [{ type: 'requested' }]);
  assert.equal(value.waiting.status, 'settled');
  for (const status of ['local-verification-required', 'local-artifact-verification-required', 'diagnosis-required', 'authorization-required', 'blocked']) {
    let calls = 0;
    const stopped = await runReleaseOperationUntilSettled({ action: 'prepare', wait: true }, {
      runReleaseOperation: async () => { calls++; return { status, effects: [] }; }, sleep: () => assert.fail('a real blocker must return immediately'),
    });
    assert.equal(stopped.status, status); assert.equal(calls, 1);
  }
});

test('continuous release times out with the original run identity and can be disabled', async () => {
  const { runReleaseOperationUntilSettled, compactReleaseOperation } = await import('../../../../../../skills/buildr-release/scripts/release-orchestration-runner.ts');
  let now = 0, calls = 0;
  const dependencies = { now: () => now, sleep: async (ms: number) => { now += ms; },
    runReleaseOperation: async () => { calls++; return { status: 'candidate-running', candidate: { runId: 42 }, context: { files: Array(500).fill('large inventory') }, effects: [], nextActions: ['continue the same request'] }; } };
  const value = await runReleaseOperationUntilSettled({ action: 'prepare', wait: true, waitIntervalMs: 10, waitTimeoutMs: 20 }, dependencies);
  assert.equal(value.waiting.status, 'timed-out'); assert.equal(value.candidate.runId, 42); assert.equal(calls, 3);
  const compact = compactReleaseOperation(value);
  assert.equal(compact.candidate.runId, 42); assert.equal('context' in compact, false); assert.deepEqual(compact.nextActions, value.nextActions);
  await runReleaseOperationUntilSettled({ action: 'prepare' }, { ...dependencies, sleep: () => assert.fail('waiting must be explicit') });
  assert.equal(calls, 4);
  await assert.rejects(runReleaseOperationUntilSettled({ waitTimeoutMs: NaN }, dependencies), /invalid/u);
});
