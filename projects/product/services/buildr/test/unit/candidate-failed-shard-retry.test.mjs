import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectCandidateFailedShardRetry,
  retryCandidateFailedShards,
} from '../../tools/release/candidate-failed-shard-retry.mjs';

const runId = 32807422982;
const sourceCommit = 'a'.repeat(40);
const jobs = [
  { name: 'Development feedback (macOS affected and Browser)', conclusion: 'skipped' },
  { name: 'Candidate bootstrap', conclusion: 'success' },
  { name: 'Candidate core (core-task-lifecycle-macos)', conclusion: 'success' },
  { name: 'Candidate core (core-package-runtime-release-macos)', conclusion: 'failure' },
  { name: 'Candidate Windows (runtime-windows)', conclusion: 'success' },
  { name: 'Candidate Host Node (host-minimum-macos)', conclusion: 'success' },
  { name: 'Candidate gate', conclusion: 'failure' },
];

function fixture(overrides = {}) {
  const calls = [];
  const current = {
    repository: { full_name: 'BuildrAI/Buildr' },
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'failure',
    path: '.github/workflows/verify.yml@refs/heads/release-0.1.0-rc.23',
    head_sha: sourceCommit,
    run_attempt: 1,
    ...overrides.current,
  };
  const execute = (command, args) => {
    const key = [command, ...args].join(' ');
    calls.push(key);
    if (key.startsWith(`gh api repos/BuildrAI/Buildr/actions/runs/${runId}`)) return { status: 0, stdout: JSON.stringify(current) };
    if (key.startsWith(`gh run view ${runId} `)) return { status: 0, stdout: JSON.stringify({ jobs: overrides.jobs || jobs }) };
    if (key.startsWith(`gh run rerun ${runId} --failed `)) return { status: 0, stdout: '' };
    return { status: 1, stderr: `unexpected command: ${key}` };
  };
  return { execute, calls };
}

test('Candidate retry inspection selects only failed shards from one matching run', () => {
  const dependencies = fixture();
  const result = inspectCandidateFailedShardRetry({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture' }, dependencies);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.failedShards, ['Candidate core (core-package-runtime-release-macos)']);
  assert.deepEqual(result.effects, []);
  assert.equal(dependencies.calls.some((call) => call.includes('run rerun')), false);
});

test('Candidate retry requires explicit confirmation before rerun', () => {
  const dependencies = fixture();
  const blocked = retryCandidateFailedShards({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture' }, dependencies);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.findings[0].code, 'candidate-retry-confirmation-required');
  assert.equal(dependencies.calls.some((call) => call.includes('run rerun')), false);

  const dispatched = retryCandidateFailedShards({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture', confirm: true }, dependencies);
  assert.equal(dispatched.status, 'dispatched');
  assert.equal(dispatched.effects[0].type, 'github-candidate-failed-jobs-rerun');
  assert.equal(dependencies.calls.filter((call) => call.includes(`run rerun ${runId} --failed`)).length, 1);
});

test('Candidate retry blocks changed source and nonterminal shard sets', () => {
  const wrongSource = fixture({ current: { head_sha: 'b'.repeat(40) } });
  assert.equal(inspectCandidateFailedShardRetry({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture' }, wrongSource).status, 'blocked');

  const queued = fixture({ jobs: jobs.map((job) => job.name.includes('core-package') ? { ...job, conclusion: null } : job) });
  const result = inspectCandidateFailedShardRetry({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture' }, queued);
  assert.equal(result.status, 'blocked');
  assert.ok(result.findings.some((item) => item.code === 'candidate-shard-not-terminal'));

  const invalidAttempt = fixture({ current: { run_attempt: null } });
  assert.ok(inspectCandidateFailedShardRetry({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture' }, invalidAttempt).findings.some((item) => item.code === 'candidate-run-attempt-invalid'));
});
