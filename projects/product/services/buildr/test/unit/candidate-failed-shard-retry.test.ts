import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCandidateFailure,
  classifyCandidateStructuredFailures,
  inspectCandidateFailedShardRetry,
  retryCandidateFailedShards,
} from '../../tools/release/candidate-failed-shard-retry.ts';
import { CANDIDATE_CI_EVIDENCE_SCHEMA } from '../../tools/release/candidate-ci-contract.ts';

const runId: any = 32807422982;
const sourceCommit: any = 'a'.repeat(40);
const jobs: any[] = [
  { name: 'Development feedback (macOS affected and Browser)', conclusion: 'skipped' },
  { name: 'Candidate bootstrap', conclusion: 'success' },
  { name: 'Candidate core (core-task-lifecycle-macos)', conclusion: 'success' },
  { name: 'Candidate core (core-package-runtime-release-macos)', conclusion: 'failure' },
  { name: 'Candidate Windows (runtime-windows)', conclusion: 'success' },
  { name: 'Candidate Host Node (host-minimum-macos)', conclusion: 'success' },
  { name: 'Candidate gate', conclusion: 'failure' },
];

function fixture(overrides: any = {}): any  {
  const calls: any[] = [];
  const optionsSeen: any[] = [];
  const current: any = {
    repository: { full_name: 'BuildrAI/Buildr' },
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'failure',
    path: '.github/workflows/verify.yml@refs/heads/release-0.1.0-rc.23',
    head_sha: sourceCommit,
    run_attempt: 1,
    ...overrides.current,
  };
  const execute: any = (command: any, args: any, options: any) => {
    const key: any = [command, ...args].join(' ');
    calls.push(key);
    optionsSeen.push({ key, options });
    if (key.startsWith(`gh api repos/BuildrAI/Buildr/actions/runs/${runId}`)) return { status: 0, stdout: JSON.stringify(current) };
    if (args.includes('--log-failed')) return { status: 0, stdout: overrides.log ?? 'ECONNRESET during artifact download' };
    if (key.startsWith(`gh run view ${runId} `)) return { status: 0, stdout: JSON.stringify({ jobs: overrides.jobs || jobs }) };
    if (key.startsWith(`gh run rerun ${runId} --failed `)) return { status: 0, stdout: '' };
    return { status: 1, stderr: `unexpected command: ${key}` };
  };
  return { execute, calls, optionsSeen, readFailureEvidence: () => overrides.evidence ?? [] };
}

test('Candidate retry inspection selects only failed shards from one matching run', () => {
  const dependencies: any = fixture();
  const result: any = inspectCandidateFailedShardRetry({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture' }, dependencies);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.failedShards, ['Candidate core (core-package-runtime-release-macos)']);
  assert.deepEqual(result.effects, []);
  assert.equal(dependencies.calls.some((call: any) => call.includes('run rerun')), false);
  assert.equal(dependencies.optionsSeen.find((call: any) => call.key.includes('--log-failed')).options.timeout, 90_000);
});

test('Candidate retry automatically reruns only failed jobs after matching inspection', () => {
  const dependencies: any = fixture();
  const dispatched: any = retryCandidateFailedShards({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture' }, dependencies);
  assert.equal(dispatched.status, 'dispatched');
  assert.equal(dispatched.effects[0].type, 'github-candidate-failed-jobs-rerun');
  assert.equal(dependencies.calls.filter((call: any) => call.includes(`run rerun ${runId} --failed`)).length, 1);
});

test('a transient gate failure recovers only aggregation after the selected jobs passed', () => {
  const completed = [
    { name: 'Candidate plan', conclusion: 'success' },
    ...jobs.map(job => job.name === 'Candidate gate' ? job : { ...job, conclusion: job.name.startsWith('Development') ? 'skipped' : 'success' }),
    { name: 'Plugin source Candidate', conclusion: 'skipped' },
  ];
  const dependencies = fixture({ jobs: completed });
  const intents: any[] = [];
  const result = retryCandidateFailedShards({ runId, sourceCommit, repo: '/fixture' }, { ...dependencies,
    onRetryIntent: (intent: any) => {
      assert.equal(dependencies.calls.some((call: string) => call.includes('run rerun')), false, 'persist intent before sending');
      intents.push(intent);
    },
  });
  assert.equal(result.status, 'dispatched');
  assert.equal(result.recoveryScope, 'aggregate-only');
  assert.equal(result.classificationSource, 'aggregate-log');
  assert.deepEqual(result.failedShards, []);
  assert.deepEqual(intents, [{ runId, previousAttempt: 1, recoveryScope: 'aggregate-only' }]);
  assert.equal(dependencies.calls.filter((call: string) => call.includes('run rerun')).length, 1);
  assert.equal(dependencies.calls.some((call: string) => call.includes('run download')), false, 'the gate owns complete evidence aggregation');
  const reused = fixture({ jobs: completed.map(job => job.name.includes('(') || job.name === 'Plugin source Candidate' ? { ...job, conclusion: 'skipped' } : job) });
  assert.equal(retryCandidateFailedShards({ runId, sourceCommit, repo: '/fixture' }, reused).status, 'dispatched', 'fully reused checks still restore only the gate');
  for (const overrides of [
    { log: 'AssertionError: evidence missing' },
    { current: { run_attempt: 2 } },
    { jobs: completed.map(job => job.name === 'Candidate plan' ? { ...job, conclusion: 'skipped' } : job) },
    { jobs: completed.map(job => job.name.includes('core-package') ? { ...job, conclusion: null } : job) },
    { jobs: completed.map(job => job.name.includes('core-package') ? { ...job, conclusion: 'cancelled' } : job) },
    { jobs: completed.map(job => job.name.startsWith('Development') ? { ...job, conclusion: 'failure' } : job) },
  ]) {
    const blocked = fixture({ jobs: completed, ...overrides });
    assert.equal(retryCandidateFailedShards({ runId, sourceCommit, repo: '/fixture' }, blocked).status, 'blocked');
    assert.equal(blocked.calls.some((call: string) => call.includes('run rerun')), false);
  }
});

test('Candidate retry blocks changed source and nonterminal shard sets', () => {
  const wrongSource: any = fixture({ current: { head_sha: 'b'.repeat(40) } });
  assert.equal(inspectCandidateFailedShardRetry({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture' }, wrongSource).status, 'blocked');

  const queued: any = fixture({ jobs: jobs.map((job: any) => job.name.includes('core-package') ? { ...job, conclusion: null } : job) });
  const result: any = inspectCandidateFailedShardRetry({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture' }, queued);
  assert.equal(result.status, 'blocked');
  assert.ok(result.findings.some((item: any) => item.code === 'candidate-shard-not-terminal'));

  const invalidAttempt: any = fixture({ current: { run_attempt: null } });
  assert.ok(inspectCandidateFailedShardRetry({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture' }, invalidAttempt).findings.some((item: any) => item.code === 'candidate-run-attempt-invalid'));
});


test('timeouts and repeated errors require diagnosis rather than another retry', () => {
  const timedOut = fixture({ log: 'Process timed out after 300000ms; no assertion failure' });
  assert.equal(inspectCandidateFailedShardRetry({ runId, sourceCommit, repo: '/fixture' }, timedOut).status, 'blocked');
  const repeated = fixture({ current: { run_attempt: 2 } });
  assert.ok(inspectCandidateFailedShardRetry({ runId, sourceCommit, repo: '/fixture' }, repeated).findings.some((item: any) => item.code === 'candidate-auto-retry-exhausted'));
  const assertion = fixture({ log: 'AssertionError: expected true; previous ECONNRESET was unrelated' });
  assert.equal(inspectCandidateFailedShardRetry({ runId, sourceCommit, repo: '/fixture' }, assertion).status, 'blocked');
});

const failedId = 'core-package-runtime-release-macos';
const expected = { runId, runAttempt: 1, sourceCommit, failedIds: [failedId] };
const evidence = (results: any[], overrides: any = {}) => [{ schemaVersion: CANDIDATE_CI_EVIDENCE_SCHEMA, id: failedId, status: 'failed', workflow: { runId, runAttempt: 1 }, sourceCommit, results, ...overrides }];

test('structured retry preserves timeout, real assertion and cleanup facts instead of classifying wrapping assertions', () => {
  const result = (failureFacts: any[], overrides: any = {}) => ({ status: 'failed', processCleanup: { status: 'clean' }, failureFacts, ...overrides });
  const transient = { stage: 'execution', kind: 'transient', code: 'ECONNRESET' };
  const timeout = { stage: 'execution', kind: 'timeout', code: 'capability-timeout' };
  assert.equal(classifyCandidateStructuredFailures(evidence([result([transient])]), expected), 'transient');
  assert.equal(classifyCandidateStructuredFailures(evidence([result([transient, timeout])]), expected), 'diagnosis-required');
  assert.equal(classifyCandidateStructuredFailures(evidence([result([timeout, { stage: 'execution', kind: 'assertion', code: 'ERR_ASSERTION' }])]), expected), 'deterministic');
  assert.equal(classifyCandidateStructuredFailures(evidence([result([transient], { processCleanup: { status: 'failed' } })]), expected), 'diagnosis-required');
  assert.equal(classifyCandidateStructuredFailures(evidence([result([])]), expected), 'diagnosis-required');
  assert.equal(classifyCandidateStructuredFailures(evidence([result([transient], { status: 'timed-out' })]), expected), 'diagnosis-required');
  assert.equal(classifyCandidateStructuredFailures(evidence([result([null])]), expected), 'diagnosis-required');
  assert.equal(classifyCandidateStructuredFailures(evidence([result([transient])], { sourceCommit: 'b'.repeat(40) }), expected), 'diagnosis-required');
  assert.equal(classifyCandidateStructuredFailures(evidence([result([transient])]), { ...expected, failedIds: [failedId, 'runtime-windows'] }), 'diagnosis-required');
});

test('structured preparation failure must be complete, matching and specifically transient', () => {
  const prep: any = { schemaVersion: 'buildr.candidate-environment-preparation/v1', id: failedId, status: 'failed', workflow: { runId, runAttempt: 1 }, sourceCommit, operations: [{ status: 'passed' }, { status: 'failed', failureClass: 'transient', errorCode: 'EAI_AGAIN' }] };
  assert.equal(classifyCandidateStructuredFailures([prep], expected), 'transient');
  assert.equal(classifyCandidateStructuredFailures([{ ...prep, operations: [{ status: 'running' }] }], expected), 'diagnosis-required');
  assert.equal(classifyCandidateStructuredFailures([{ ...prep, operations: [{ status: 'failed', failureClass: 'timeout', errorCode: 'ETIMEDOUT' }] }], expected), 'diagnosis-required');
});

test('structured retry facts take precedence over unrelated transient log text', () => {
  const dependencies = fixture({ evidence: evidence([{ status: 'timed-out', failureFacts: [{ stage: 'execution', kind: 'timeout', code: 'capability-timeout' }] }]) });
  const result = inspectCandidateFailedShardRetry({ runId, sourceCommit, repo: '/fixture' }, dependencies);
  assert.equal(result.failureClass, 'diagnosis-required');
  assert.equal(result.classificationSource, 'structured-evidence');
  assert.equal(dependencies.calls.some((call: string) => call.includes('--log-failed')), false);
  assert.equal(classifyCandidateFailure('AssertionError: subprocess status null, ETIMEDOUT; ECONNRESET also mentioned'), 'diagnosis-required');
  assert.equal(classifyCandidateFailure("not ok 1\n  ---\n  code: 'ERR_ASSERTION'\n  error: actual product mismatch\n  ...\ncapability-timeout"), 'deterministic');
});
