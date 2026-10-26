import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  lintCandidateStepTimeouts,
  readStepTimings,
  recordCandidateStepTimings,
} from '../../../../../../skills/buildr-release/scripts/candidate-step-timings.ts';

const serviceRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-step-timings-'));

const aggregate = (results: any[], runner = 'windows') => ({
  schemaVersion: 'buildr.candidate-ci-aggregate/v1',
  workflow: { runId: 42 },
  timing: { checks: [{ id: `runtime-${runner}`, runner: { os: runner }, results }] },
});

test('timings record only passed results plus their phases', () => {
  const root = serviceRoot();
  try {
    const recorded = recordCandidateStepTimings(root, aggregate([
      { id: 'release-tarball-consumption', status: 'passed', durationMs: 250_000, phases: [
        { id: 'package-installation', status: 'passed', durationMs: 219_000 },
        { id: 'update-check', status: 'passed', durationMs: 12_000 },
      ] },
      // A timed-out result must not fake a prior pass for retry eligibility.
      { id: 'cli-compatibility', status: 'failed', failureCode: 'capability-timeout', durationMs: 180_000 },
      // Reused results keep their origin phases.
      { id: 'source-contracts', status: 'passed', disposition: 'reused', durationMs: 0,
        originPhases: [{ id: 'contract-check', durationMs: 4_000 }],
        reusedFrom: { durationMs: 5_000, origin: { runner: { os: 'windows' } } } },
    ]), 42);
    const store = readStepTimings(root);
    assert.equal(recorded, 5);
    assert.equal(store['release-tarball-consumption'].windows[0].durationMs, 250_000);
    assert.equal(store['release-tarball-consumption::package-installation'].windows[0].durationMs, 219_000);
    assert.equal(store['release-tarball-consumption::update-check'].windows[0].durationMs, 12_000);
    assert.equal(store['cli-compatibility'], undefined);
    assert.equal(store['source-contracts'].windows[0].durationMs, 5_000);
    assert.equal(store['source-contracts::contract-check'].windows[0].durationMs, 4_000);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('timeout lint warns on saturated steps and dominant install phases', () => {
  const root = serviceRoot();
  try {
    const steps = [
      { id: 'release-tarball-consumption', timeoutMs: 360_000 },
      { id: 'cli-compatibility', timeoutMs: 180_000 },
      { id: 'source-contracts', timeoutMs: 60_000 },
    ];
    assert.deepEqual(lintCandidateStepTimeouts(root, steps), []);
    recordCandidateStepTimings(root, aggregate([
      { id: 'release-tarball-consumption', status: 'passed', durationMs: 250_000, phases: [
        // 219s install against a 360s step budget passes the step lint but
        // breaches the 50% phase-dominance rule — the prior rc.50 miss.
        { id: 'package-installation', status: 'passed', durationMs: 219_000 },
      ] },
      { id: 'cli-compatibility', status: 'passed', durationMs: 178_000 },
      { id: 'source-contracts', status: 'passed', durationMs: 5_000 },
    ]), 42);
    const warnings = lintCandidateStepTimeouts(root, steps);
    const warned = warnings.map((warning: any) => warning.stepId);
    assert.ok(warned.includes('release-tarball-consumption::package-installation'));
    assert.ok(warned.includes('cli-compatibility'));
    assert.ok(!warned.includes('release-tarball-consumption'), 'the step total alone stays under its budget');
    assert.ok(!warned.includes('source-contracts'));
    // Phase dominance also fires under a smaller budget even when the recorded
    // step total would still pass the step-level lint.
    const oldSteps = [{ id: 'release-tarball-consumption', timeoutMs: 300_000 }];
    assert.ok(lintCandidateStepTimeouts(root, oldSteps).some((warning: any) => warning.stepId === 'release-tarball-consumption::package-installation'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
