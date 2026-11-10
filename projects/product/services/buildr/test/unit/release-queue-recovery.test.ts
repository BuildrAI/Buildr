import assert from 'node:assert/strict';
import test from 'node:test';

import { recoverQueuedRelease, releaseQueuePolicy } from '../../../../../../skills/buildr-release/scripts/github-queue-recovery.ts';
import { frozenReleaseDispatchArgs } from '../../../../../../skills/buildr-release/scripts/release-transaction-runner.ts';
import { createReleaseContext } from '../../../../../../skills/buildr-release/scripts/release-readiness.ts';

const repository = 'BuildrAI/Buildr';
const sha = (letter: string): string => letter.repeat(40);
const digest = (letter: string): string => `sha256-${letter.repeat(64)}`;
const now = Date.parse('2026-11-08T12:00:00.000Z');
const old = '2026-11-08T11:50:00.000Z';
const head = sha('a');
const title = 'Candidate 42';

function run(overrides: Record<string, unknown> = {}): any {
  return { id: 100, run_attempt: 1, head_sha: head, head_branch: 'codex/test', display_title: title,
    status: 'queued', conclusion: null, created_at: old, event: 'workflow_dispatch',
    path: '.github/workflows/verify.yml@refs/heads/codex/test', repository: { full_name: repository }, ...overrides };
}

function pointer(): any {
  return { requested: true, runId: 100, previousRunIds: [],
    dispatchArgs: ['workflow', 'run', '.github/workflows/verify.yml', '--repo', repository, '--ref', 'codex/test',
      '-f', 'purpose=candidate'] };
}

function fakeGh(options: { jobs?: any; terminal?: any; queuedRun?: any } = {}): { gh: any; calls: string[][] } {
  const calls: string[][] = [];
  const gh = (args: string[]): string => {
    calls.push(args);
    const value = args.join(' ');
    if (value === `api repos/${repository}/actions/runs/100`) return JSON.stringify(options.queuedRun ?? run());
    if (value === `api repos/${repository}/actions/runs/100/attempts/1/jobs?per_page=100`) { /* unreachable: paginate below */ }
    if (args[0] === 'api' && args.includes('--paginate')) return JSON.stringify([{ jobs: options.jobs ?? [{ id: 9, status: 'queued', created_at: old, steps: [] }] }]);
    if (value === `run cancel 100 --repo ${repository}`) return '';
    if (value === `api repos/${repository}/actions/runs/100` && options.terminal) return JSON.stringify(options.terminal);
    if (args[0] === 'api' && args[1]?.startsWith(`repos/${repository}/commits/`)) return JSON.stringify({ sha: head });
    if (args[0] === 'workflow' && args[1] === 'run') return '';
    if (args[0] === 'run' && args[1] === 'list') return JSON.stringify([{ databaseId: 101, headSha: head, displayTitle: title, status: 'queued', conclusion: null }]);
    throw new Error(`unexpected gh call: ${value}`);
  };
  return { gh, calls };
}

test('queue timeout cancels a never-started run and redispatches with frozen inputs', () => {
  const { gh, calls } = fakeGh({
    // The final readback must return the terminal identity after cancel.
    terminal: run({ status: 'completed', conclusion: 'cancelled' }),
  });
  // First read observes queued; later reads observe completion.
  let reads = 0;
  const observed = (args: string[]): string => {
    const value = args.join(' ');
    if (value === `api repos/${repository}/actions/runs/100`) {
      reads += 1;
      return JSON.stringify(reads === 1 ? run() : run({ status: 'completed', conclusion: 'cancelled' }));
    }
    return gh(args);
  };
  let saves = 0;
  const target = pointer();
  const result = recoverQueuedRelease(target, {}, { gh: observed, save: () => { saves += 1; }, now: () => now });
  assert.equal(result.status, 'redispatched');
  assert.equal(result.previousRunId, 100);
  assert.equal(target.runId, 101);
  assert.deepEqual(target.previousRunIds, [100]);
  assert.equal(target.queueHistory.length, 1);
  assert.equal(target.queueHistory[0].redispatchRequested, true);
  assert.equal(target.queueHistory[0].dispatchState, 'accepted');
  assert.equal(target.queueRedispatch, undefined);
  assert.ok(saves >= 3);
  const cancel = calls.findIndex(args => args[0] === 'run' && args[1] === 'cancel');
  const dispatch = calls.findLastIndex(args => args[0] === 'workflow' && args[1] === 'run');
  assert.ok(cancel >= 0 && dispatch > cancel, 'cancel must precede the replacement dispatch');
});

test('a cancelled run whose job already started is not redispatched', () => {
  const { gh, calls } = fakeGh({
    queuedRun: run({ status: 'completed', conclusion: 'cancelled' }),
    jobs: [{ id: 9, status: 'completed', started_at: old, steps: [{ started_at: old }] }],
  });
  const result = recoverQueuedRelease(pointer(), {}, { gh, save: () => {}, now: () => now });
  assert.equal(result, null);
  assert.equal(calls.some(args => args[0] === 'run' && args[1] === 'cancel'), false);
  assert.equal(calls.some(args => args[0] === 'workflow' && args[1] === 'run'), false);
});

test('a run still inside the queue deadline is left alone', () => {
  const { gh, calls } = fakeGh();
  const result = recoverQueuedRelease(pointer(), { queueTimeoutSeconds: 3600 }, { gh, save: () => {}, now: () => now });
  assert.equal(result, null);
  assert.equal(calls.some(args => args[0] === 'run' && args[1] === 'cancel'), false);
});

test('frozen dispatch inputs restore only the validated release context', () => {
  const context = createReleaseContext({
    selection: { identity: digest('1'), version: '1.2.3', branch: 'release-1.2.3', releaseHead: sha('a'), releaseTree: sha('b'), generation: 2, status: 'frozen' },
    release: { version: '1.2.3', sourceCommit: sha('a'), sourceTree: sha('b') },
    candidate: { workflow: '.github/workflows/verify.yml', runId: 42, runAttempt: 1, runUrl: 'https://github.example/runs/42', sourceCommit: sha('a'), sourceTree: sha('b'), registryIdentity: digest('2'), aggregateIdentity: digest('3'), status: 'passed' },
    artifact: { artifactName: 'candidate-package', sourceCommit: sha('a'), filename: 'buildr.tgz', size: 100, sha256: '4'.repeat(64), integrity: 'sha512-test', applicationPayloadDigest: digest('5') },
    convergence: { mainCommit: sha('c'), mainTree: sha('b'), devCommit: sha('d'), devTree: sha('e') },
    preparation: { identity: digest('6'), status: 'passed', taskId: 'release-1.2.3', sourceCommit: sha('c'), nodeVersion: '24.15.0', nodeIdentity: digest('7') },
    node: { authority: 'projects/product/.node-version', version: '24.15.0', executionIdentity: digest('7') },
    workflow: { path: '.github/workflows/publish.yml', digest: digest('8'), repository, environment: 'npm-production' },
    taskCorrelation: { identity: digest('9'), status: 'passed', sourceCommit: sha('a'), sourceTree: sha('b'), remoteRef: sha('c') },
  });
  const args = frozenReleaseDispatchArgs(context, 'release-id');
  assert.deepEqual(args.slice(0, 6), ['workflow', 'run', 'publish.yml', '--repo', repository, '--ref']);
  assert.ok(args.includes(`release_id=release-id`));
  assert.ok(args.includes(`version=1.2.3`));
  assert.ok(args.includes(`source_commit=${sha('c')}`));
  assert.ok(args.includes(`candidate_base=${sha('a')}`));
  assert.ok(args.includes(`candidate_tree=${sha('b')}`));
  assert.ok(args.includes(`workflow_sha256=${digest('8').slice(7)}`));
  assert.ok(args.includes(`context_digest=${context.identity}`));
  assert.ok(args.includes('candidate_run_id=42'));
  assert.ok(args.some(value => value.startsWith('release_context=')));
});

test('queue policy rejects unsafe budgets before any remote call', () => {
  assert.throws(() => releaseQueuePolicy({ queueTimeoutSeconds: 0 }), /Invalid release queue/);
  assert.throws(() => releaseQueuePolicy({ maxQueueRedispatches: 21 }), /Invalid release queue/);
  assert.deepEqual(releaseQueuePolicy({ queueTimeoutSeconds: 30, maxQueueRedispatches: 0 }), { timeoutSeconds: 30, maxRedispatches: 0 });
});
