import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectCandidateFailedShardRetry } from '../../tools/release/candidate-failed-shard-retry.mjs';
import { compactReleasePhaseTimeline, createReleasePhaseTimeline, projectCandidateAttempts, projectCandidateRetryAttempts } from '../../tools/release/release-phase-timeline.mjs';

const digest = (letter) => `sha256-${letter.repeat(64)}`;

test('timeline derives duration only from two proven canonical boundaries', () => {
  const timeline = createReleasePhaseTimeline({
    version: '1.0.0-rc.1',
    generation: 2,
    terminalStatus: 'active',
    phases: [
      { id: 'selection', phase: 'selection', status: 'passed', owner: { id: 'release-selection', identity: digest('1') }, startedAt: '2026-08-25T00:00:00.000Z', finishedAt: '2026-08-25T00:00:02.500Z', waitType: 'machine-execution' },
      { id: 'authorization', phase: 'publication-authorization', status: 'pending', owner: { id: 'maintainer', identity: null }, startedAt: '2026-08-25T00:00:03.000Z', finishedAt: null, waitType: 'human-decision' },
    ],
  });
  assert.equal(timeline.phases[0].timing.durationMs, 2500);
  assert.equal(timeline.phases[0].timing.precision, 'complete');
  assert.equal(timeline.phases[1].timing.durationMs, null);
  assert.equal(timeline.phases[1].timing.precision, 'unknown');
  assert.equal(timeline.phases[1].waitType, 'human-decision');
  assert.match(timeline.identity, /^sha256-/u);
  assert.equal(createReleasePhaseTimeline({ version: '1.0.0-rc.1', generation: 2, terminalStatus: 'active', phases: timeline.phases.map((item) => ({ ...item, startedAt: item.timing.startedAt, finishedAt: item.timing.finishedAt })) }).identity, timeline.identity);
});

test('candidate attempts preserve reused evidence origin and actual rerun scope', () => {
  const phases = projectCandidateAttempts([
    {
      runId: 42,
      runAttempt: 1,
      queuedAt: '2026-08-25T00:00:00.000Z',
      startedAt: '2026-08-25T00:00:01.000Z',
      finishedAt: '2026-08-25T00:01:00.000Z',
      status: 'failed',
      rerunScope: ['windows-runtime', 'macos-core'],
      evidence: [{ id: 'macos-core', disposition: 'executed', originRunId: 42, originRunAttempt: 1, identity: digest('2') }],
    },
    {
      runId: 42,
      runAttempt: 2,
      queuedAt: '2026-08-25T00:02:00.000Z',
      startedAt: '2026-08-25T00:02:01.000Z',
      finishedAt: '2026-08-25T00:02:30.000Z',
      status: 'passed',
      rerunScope: ['windows-runtime'],
      aggregateIdentity: digest('3'),
      evidence: [
        { id: 'macos-core', disposition: 'reused', originRunId: 42, originRunAttempt: 1, identity: digest('2') },
        { id: 'windows-runtime', disposition: 'executed', originRunId: 42, originRunAttempt: 2, identity: digest('4') },
      ],
    },
  ]);
  const timeline = createReleasePhaseTimeline({ version: '1.0.0-rc.1', generation: 2, terminalStatus: 'active', phases });
  const retry = timeline.phases.find((item) => item.id === 'candidate-attempt:42:2');
  assert.deepEqual(retry.attempt.rerunScope, ['windows-runtime']);
  assert.deepEqual(retry.attempt.evidence[0], { id: 'macos-core', disposition: 'reused', origin: { runId: '42', runAttempt: 1 }, identity: digest('2') });
  assert.equal(retry.attempt.aggregateIdentity, digest('3'));
  assert.equal(timeline.phases.find((item) => item.id === 'candidate-queue:42:2').waitType, 'platform-queue');
});

test('timeline consumes the delivered failed-shard retry and aggregate workflow facts', () => {
  const runId = 32807422982;
  const sourceCommit = 'a'.repeat(40);
  const jobs = [
    { name: 'Candidate bootstrap', conclusion: 'success' },
    { name: 'Candidate core (core-task-lifecycle-macos)', conclusion: 'success' },
    { name: 'Candidate core (core-package-runtime-release-macos)', conclusion: 'failure' },
    { name: 'Candidate Windows (runtime-windows)', conclusion: 'success' },
    { name: 'Candidate gate', conclusion: 'failure' },
  ];
  const execute = (_command, args) => args[0] === 'api'
    ? { status: 0, stdout: JSON.stringify({ repository: { full_name: 'BuildrAI/Buildr' }, event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', path: '.github/workflows/verify.yml@refs/heads/release-1.0.0-rc.1', head_sha: sourceCommit, run_attempt: 1 }) }
    : { status: 0, stdout: JSON.stringify({ jobs }) };
  const retry = inspectCandidateFailedShardRetry({ runId, sourceCommit, ghCommand: 'gh', repo: '/fixture' }, { execute });
  const aggregateIdentity = digest('3');
  const attempts = projectCandidateRetryAttempts({
    retryResults: [retry],
    aggregateIdentity,
    aggregate: {
      status: 'passed',
      workflow: {
        runId: String(runId),
        aggregateAttempt: 2,
        evidenceAttempts: [
          { id: 'core-task-lifecycle-macos', runAttempt: 1, identity: digest('2') },
          { id: 'core-package-runtime-release-macos', runAttempt: 2, identity: digest('4') },
        ],
      },
    },
  });
  const timeline = createReleasePhaseTimeline({ version: '1.0.0-rc.1', generation: 2, terminalStatus: 'active', phases: projectCandidateAttempts(attempts) });
  const retryAttempt = timeline.phases.find((item) => item.id === `candidate-attempt:${runId}:2`);
  assert.deepEqual(retryAttempt.attempt.rerunScope, ['Candidate core (core-package-runtime-release-macos)']);
  assert.deepEqual(retryAttempt.attempt.evidence.map((item) => [item.id, item.disposition, item.origin.runAttempt]), [
    ['core-package-runtime-release-macos', 'executed', 2],
    ['core-task-lifecycle-macos', 'reused', 1],
  ]);
  assert.equal(retryAttempt.attempt.aggregateIdentity, aggregateIdentity);
});

test('compact timeline keeps identity and pointer without full owner evidence', () => {
  const timeline = createReleasePhaseTimeline({ version: '1.0.0', generation: 0, terminalStatus: 'closed', phases: [
    { id: 'doctor', phase: 'doctor', status: 'passed', owner: { id: 'doctor', identity: digest('5') }, startedAt: null, finishedAt: '2026-08-25T00:00:00.000Z', waitType: 'machine-execution' },
  ] });
  const compact = compactReleasePhaseTimeline(timeline);
  assert.equal(compact.timelineIdentity, timeline.identity);
  assert.deepEqual(compact.inspect, { owner: 'release-orchestration', operation: 'inspect', timelineIdentity: timeline.identity });
  assert.equal(compact.keyPhases[0].durationMs, null);
  assert.equal('phases' in compact, false);
});
