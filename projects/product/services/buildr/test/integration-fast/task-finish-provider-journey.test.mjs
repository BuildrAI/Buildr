import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';
import { advanceFinishRun, createFinishRun, executeSafeFinishRun, finalizeFinishCleanup, inspectFinishRun, prepareFinishCleanup, readFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

function run(args, cwd = PRODUCT_ROOT) {
  return spawnSync(process.execPath, [BUILDR, ...args], { cwd, encoding: 'utf8' });
}

function passCurrent(root, runId, fingerprint = 'journey-v1') {
  let checkpoint = inspectFinishRun(readFinishRun({ root, runId }));
  const step = checkpoint.currentStep;
  const claimed = advanceFinishRun({ root, runId, fingerprints: { [step]: fingerprint } });
  const options = { root, runId, fingerprints: { [step]: fingerprint }, outcome: 'passed', attemptToken: claimed.nextAction.attemptToken, evidence: { id: `${step}-journey` } };
  if (step === 'integration-push') options.refTransition = { expectedBeforePush: 'a', observedBeforePush: 'a', expectedAfterPush: 'b', observedAfterPush: 'b' };
  checkpoint = advanceFinishRun(options);
  return checkpoint;
}

test('no-conflict journey executes formal provider, cleans transient evidence and writes completion receipt', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-finish-provider-journey-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(run(['init', '--target', root, '--name', 'Journey', '--description', 'Provider journey']).status, 0);
  assert.equal(run(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo']).status, 0);
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v1', mode: 'authoritative', resources: [],
    capabilities: [{
      id: 'demo.required', title: 'demo.required', command: { argv: [process.execPath, '-e', 'void 0'], cwd: '.' }, maturity: 'stable', stages: ['affected', 'candidate'],
      enforcement: { affected: 'required', candidate: 'required' }, applicability: { paths: ['**'], risks: [] }, coverage: { kind: 'test', owns: ['demo'] },
      environment: { requires: ['node'], services: [] }, effects: { level: 'local-temporary', writes: [], externalSystems: false }, authorization: 'implicit', resourceClaims: [], dependsOn: [], supersedes: [], sources: ['journey'],
    }],
  }));

  const runId = 'provider-journey';
  createFinishRun({ root, runId, task: 'provider-journey', change: null, targetBranch: 'dev' });
  while (inspectFinishRun(readFinishRun({ root, runId })).currentStep !== 'formal-assurance') passCurrent(root, runId);
  const candidateIdentity = 'journey-candidate-v1';
  const result = await executeSafeFinishRun({
    root, runId,
    actionContext: { cliInvocation: { command: process.execPath, argsPrefix: [BUILDR] }, project: 'demo', candidateIdentity },
  });
  assert.equal(result.currentStep, 'asset-review', JSON.stringify({ safeExecution: result.safeExecution, blocked: result.blocked, formal: result.steps.find((step) => step.id === 'formal-assurance') }, null, 2));
  assert.equal(result.safeExecution.reason, 'agent-provider-required');
  assert.deepEqual(result.safeExecution.executedSteps.map((entry) => entry.actionId), ['formal-assurance.verification']);

  const summary = readFinishRun({ root, runId }).steps.find((step) => step.id === 'formal-assurance').evidence.at(-1).verificationSummary;
  assert.equal(summary.status, 'passed');
  assert.equal(summary.source.candidateFingerprint, candidateIdentity);
  const cleanup = run(['verification', 'cleanup', '--summary', summary.evidenceReference, '--json']);
  assert.equal(cleanup.status, 0, cleanup.stderr || cleanup.stdout);
  assert.equal(JSON.parse(cleanup.stdout).code, 'cleanup.removed');
  assert.equal(fs.existsSync(summary.evidenceLifecycle.cleanupReference), false);

  while (inspectFinishRun(readFinishRun({ root, runId })).currentStep !== 'cleanup') passCurrent(root, runId);
  const cleanupClaim = advanceFinishRun({ root, runId, fingerprints: { cleanup: 'journey-cleanup-v1' } });
  const prepared = prepareFinishCleanup({ root, runId, attemptToken: cleanupClaim.nextAction.attemptToken, evidence: { id: 'journey-cleanup-ready', worktreeClean: true } });
  assert.equal(prepared.cleanup.status, 'prepared');
  const completed = finalizeFinishCleanup({ root, runId, evidence: { id: 'journey-cleanup-complete', environmentRetained: true } });
  assert.equal(completed.status, 'complete');
  assert.equal(fs.existsSync(completed.completionReceipt), true);
  assert.equal(JSON.parse(fs.readFileSync(completed.completionReceipt, 'utf8')).timing.coverage, 'product-partial');
});
