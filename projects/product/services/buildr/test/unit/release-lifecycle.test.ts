import assert from 'node:assert/strict';
import test from 'node:test';

import { createReleaseLifecycle, projectReleaseLifecycleOrchestration } from '../../tools/release/release-lifecycle.ts';

const digest: any = (letter: any) => `sha256-${letter.repeat(64)}`;

function input(overrides: any = {}): any  {
  return {
    version: '1.0.0-rc.1',
    releaseTask: { taskId: 'release-1.0.0-rc.1', status: 'active', recordDigest: digest('1') },
    selection: { status: 'frozen', generation: 2, identity: digest('2') },
    candidate: { status: 'passed', identity: digest('3') },
    readiness: { status: 'ready', contextDigest: digest('4') },
    publication: { status: 'not-started', runId: null, evidenceIdentity: null },
    convergence: { status: 'not-started', recoveryIdentity: null },
    closeout: { status: 'not-started', identity: null, formalReleaseRef: null },
    ...overrides,
  };
}

test('readiness keeps the unique release Task active while awaiting publication authorization', () => {
  const lifecycle: any = createReleaseLifecycle(input());
  assert.equal(lifecycle.phase, 'awaiting-publication-authorization');
  assert.equal(lifecycle.status, 'active');
  assert.match(lifecycle.recoveryIdentity, /^sha256-/u);
  assert.throws(() => createReleaseLifecycle(input({ releaseTask: { taskId: 'release-1.0.0-rc.1', status: 'completed', recordDigest: digest('1') } })), /must remain active/u);
});

test('same generation and context keep a stable recovery identity across transient publication attempts', () => {
  const failed: any = createReleaseLifecycle(input({ publication: { status: 'failed', runId: 42, evidenceIdentity: digest('5') } }));
  const running: any = createReleaseLifecycle(input({ publication: { status: 'running', runId: 42, evidenceIdentity: digest('6') } }));
  assert.equal(failed.phase, 'publishing');
  assert.equal(failed.recoveryIdentity, running.recoveryIdentity);
});

test('readiness phase remains representable before a context digest exists', () => {
  const lifecycle: any = createReleaseLifecycle(input({
    candidate: { status: 'passed', identity: digest('9') },
    readiness: { status: 'blocked', contextDigest: null },
  }));
  assert.equal(lifecycle.phase, 'readiness');
  assert.equal(lifecycle.status, 'active');
});

test('passed Publication waits for dev provenance reconciliation before closeout', () => {
  const lifecycle: any = createReleaseLifecycle(input({
    publication: { status: 'passed', runId: 42, evidenceIdentity: digest('5') },
    convergence: { status: 'published-but-dev-reconciliation-blocked', recoveryIdentity: digest('6') },
  }));
  assert.equal(lifecycle.phase, 'published-dev-reconciliation-pending');
  assert.equal(lifecycle.status, 'active');
});

test('closed lifecycle requires zero intermediate resources and a verified retained formal release ref', () => {
  const closed: any = createReleaseLifecycle(input({
    publication: { status: 'passed', runId: 42, evidenceIdentity: digest('5') },
    convergence: { status: 'passed', recoveryIdentity: digest('6') },
    closeout: { status: 'passed', identity: digest('7'), formalReleaseRef: { disposition: 'retained-and-verified', ref: 'refs/heads/release-1.0.0-rc.1' } },
  }));
  assert.equal(closed.phase, 'closed');
  assert.equal(closed.status, 'passed');
  const completed: any = createReleaseLifecycle(input({
    releaseTask: { taskId: 'release-1.0.0-rc.1', status: 'completed', recordDigest: digest('1') },
    publication: { status: 'passed', runId: 42, evidenceIdentity: digest('5') },
    convergence: { status: 'passed', recoveryIdentity: digest('6') },
    closeout: { status: 'passed', identity: digest('7'), formalReleaseRef: { disposition: 'retained-and-verified', ref: 'refs/heads/release-1.0.0-rc.1' } },
  }));
  assert.equal(completed.status, 'passed');
  assert.throws(() => createReleaseLifecycle(input({
    releaseTask: { taskId: 'release-1.0.0-rc.1', status: 'completed', recordDigest: digest('1') },
    publication: { status: 'passed', runId: 42, evidenceIdentity: digest('5') },
    convergence: { status: 'passed', recoveryIdentity: digest('6') },
    closeout: { status: 'passed', identity: digest('7'), formalReleaseRef: null },
  })), /verified retained formal release ref/u);
});

test('lifecycle projection binds the current orchestration action and timeline identity', () => {
  const lifecycle: any = createReleaseLifecycle(input());
  const projected: any = projectReleaseLifecycleOrchestration(lifecycle, digest('a'));
  assert.deepEqual(projected.orchestration, {
    action: 'prepare-dispatch',
    recoveryIdentity: lifecycle.recoveryIdentity,
    timelineIdentity: digest('a'),
  });
  assert.equal(projectReleaseLifecycleOrchestration(createReleaseLifecycle(input({
    publication: { status: 'passed', runId: 42, evidenceIdentity: digest('5') },
    convergence: { status: 'passed', recoveryIdentity: digest('6') },
    closeout: { status: 'passed', identity: digest('7'), formalReleaseRef: { disposition: 'retained-and-verified', ref: 'refs/heads/release-1.0.0-rc.1' } },
  })), digest('b')).orchestration.action, 'closeout');
});
