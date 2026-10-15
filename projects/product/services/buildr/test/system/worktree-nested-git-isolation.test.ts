import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import test from 'node:test';
import { createVerificationPhaseRecorder, VERIFICATION_PHASE_TIMING_PREFIX } from '../verification/timing/phases.ts';

const sourceProductRoot = path.resolve(import.meta.dirname, '../..');
const phaseScope = 'system-nested-git-isolation';
const phaseEvidenceOutput = process.env.BUILDR_VERIFICATION_PHASE_OUTPUT;
if (phaseEvidenceOutput) fs.mkdirSync(path.dirname(path.resolve(phaseEvidenceOutput)), { recursive: true });
const diagnosticRoot = process.env.BUILDR_DIAGNOSTICS_OUTPUT || (phaseEvidenceOutput ? path.dirname(path.resolve(phaseEvidenceOutput)) : null);
const nestedPhaseOutput = diagnosticRoot ? path.join(diagnosticRoot, `nested-git-isolation-${process.pid}.jsonl`) : null;
if (nestedPhaseOutput) { fs.mkdirSync(path.dirname(nestedPhaseOutput), { recursive: true }); fs.rmSync(nestedPhaseOutput, { force: true }); }

// Windows run 37985484755 completed all phases and cleanup in 121291 ms;
// the prior 135-second run expired mid-scenario. Keep per-command and suite bounds.
test('非 Git 根通过公共入口隔离独立子仓库并保留资料', { timeout: process.platform === 'win32' ? 180_000 : 90_000 }, () => {
  const nestedWrapperTiming = createVerificationPhaseRecorder(phaseScope, { persistEvidence: true });
  const nestedWrapperStartedAt = Date.now();
  const nestedWrapperStarted = `${VERIFICATION_PHASE_TIMING_PREFIX} ${JSON.stringify({
    scope: phaseScope, id: 'nested-wrapper', status: 'started', startedAt: new Date(nestedWrapperStartedAt).toISOString(),
  })}\n`;
  fs.writeSync(process.stderr.fd, nestedWrapperStarted);
  if (phaseEvidenceOutput) fs.appendFileSync(path.resolve(phaseEvidenceOutput), nestedWrapperStarted, 'utf8');
  let result: SpawnSyncReturns<string>;
  let nestedWrapperStatus = 'failed';
  try {
    result = spawnSync(process.execPath, [
      path.join(sourceProductRoot, 'tools/development/run-isolated-workspace-smoke.ts'),
      '--script', path.join(sourceProductRoot, 'test/integration/non-git-workspace-continuity.test.ts'),
      '--', '--nested-git-isolation-scenario',
    ], { cwd: sourceProductRoot, env: { ...process.env, ...(nestedPhaseOutput ? { BUILDR_NESTED_GIT_PHASE_OUTPUT: nestedPhaseOutput } : {}) }, encoding: 'utf8', timeout: process.platform === 'win32' ? 175_000 : 85_000, maxBuffer: 8 * 1024 * 1024 });
    nestedWrapperStatus = result.status === 0 ? 'passed' : 'failed';
  } finally {
    nestedWrapperTiming.record('nested-wrapper', nestedWrapperStartedAt, Date.now(), nestedWrapperStatus);
    nestedWrapperTiming.emit(process.stderr);
  }
  assert.equal(result.status, 0, `${result.error?.message || ''}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Nested Git public Worktree lifecycle passed/);
  assert.match(result.stdout, /"cleanup":"cleaned"/);
  process.stdout.write(result.stdout);
  const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
  assert.equal(fs.existsSync(receipt.temporaryRoot), false);
});
