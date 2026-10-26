import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import test from 'node:test';
import { createVerificationPhaseRecorder, VERIFICATION_PHASE_TIMING_PREFIX } from '../verification/timing/phases.ts';

const sourceProductRoot = path.resolve(import.meta.dirname, '../..');
const phaseScope = 'e2e-nested-git';
const phaseEvidenceOutput = process.env.BUILDR_VERIFICATION_PHASE_OUTPUT;
if (phaseEvidenceOutput) fs.mkdirSync(path.dirname(path.resolve(phaseEvidenceOutput)), { recursive: true });
const diagnosticRoot = process.env.BUILDR_DIAGNOSTICS_OUTPUT || (phaseEvidenceOutput ? path.dirname(path.resolve(phaseEvidenceOutput)) : null);

function runSection(section: 'lifecycle' | 'safety'): void {
  const nestedPhaseOutput = diagnosticRoot ? path.join(diagnosticRoot, `nested-git-isolation-${process.pid}-${section}.jsonl`) : null;
  if (nestedPhaseOutput) { fs.mkdirSync(path.dirname(nestedPhaseOutput), { recursive: true }); fs.rmSync(nestedPhaseOutput, { force: true }); }
  const wrapperPhase = section === 'lifecycle' ? 'nested-wrapper-lifecycle' : 'nested-wrapper-safety';
  const nestedWrapperTiming = createVerificationPhaseRecorder(phaseScope, { persistEvidence: true });
  const nestedWrapperStartedAt = Date.now();
  const nestedWrapperStarted = `${VERIFICATION_PHASE_TIMING_PREFIX} ${JSON.stringify({
    scope: phaseScope, id: wrapperPhase, status: 'started', startedAt: new Date(nestedWrapperStartedAt).toISOString(),
  })}\n`;
  fs.writeSync(process.stderr.fd, nestedWrapperStarted);
  if (phaseEvidenceOutput) fs.appendFileSync(path.resolve(phaseEvidenceOutput), nestedWrapperStarted, 'utf8');
  let result: SpawnSyncReturns<string>;
  let nestedWrapperStatus = 'failed';
  try {
    result = spawnSync(process.execPath, [
      path.join(sourceProductRoot, 'tools/development/run-isolated-workspace-check.ts'),
      '--script', path.join(sourceProductRoot, 'test/e2e/non-git-workspace-continuity.test.ts'),
      '--', '--nested-git-isolation-scenario',
      '--section', section,
    ], { cwd: sourceProductRoot, env: { ...process.env, ...(nestedPhaseOutput ? { BUILDR_NESTED_GIT_PHASE_OUTPUT: nestedPhaseOutput } : {}) }, encoding: 'utf8', timeout: process.platform === 'win32' ? 175_000 : 85_000, maxBuffer: 8 * 1024 * 1024 });
    nestedWrapperStatus = result.status === 0 ? 'passed' : 'failed';
  } finally {
    nestedWrapperTiming.record(wrapperPhase, nestedWrapperStartedAt, Date.now(), nestedWrapperStatus);
    nestedWrapperTiming.emit(process.stderr);
  }
  assert.equal(result.status, 0, `${result.error?.message || ''}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, section === 'lifecycle' ? /Nested Git public Worktree lifecycle passed/ : /Nested Git public Worktree safety boundaries passed/);
  assert.match(result.stdout, /"cleanup":"cleaned"/);
  process.stdout.write(result.stdout);
  const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
  assert.equal(fs.existsSync(receipt.temporaryRoot), false);
}

test('非 Git 根通过公共入口隔离独立子仓库并保留资料', { timeout: process.platform === 'win32' ? 180_000 : 90_000 }, () => {
  runSection('lifecycle');
});

test('损坏无关来源不阻止健康公共工作且拒绝通过组内链接逃逸', { timeout: process.platform === 'win32' ? 180_000 : 90_000 }, () => {
  runSection('safety');
});
