import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { cleanupAbsentVerificationEvidence, cleanupVerificationEvidence, createVerificationEvidenceLifecycle, normalizeVerificationEvidenceLifecycle } from '../../src/verification/infrastructure/evidence-lifecycle.mjs';

function summary(runId, evidence) {
  return { schemaVersion: 'buildr.verification-execution/v1', runId, run: { id: runId }, evidenceReference: evidence.summaryPath, evidenceLifecycle: evidence.lifecycle };
}

function cleanup(summaryPayload, options = {}) {
  return cleanupVerificationEvidence(summaryPayload, {
    ...options,
    removePath: (target) => fs.rmSync(target, { recursive: true, force: true }),
  });
}

test('production lifecycle cleans one exact transient run and is idempotent with captured summary', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const evidence = createVerificationEvidenceLifecycle('run-1', { temporaryRoot: root });
  const payload = summary('run-1', evidence);
  fs.writeFileSync(evidence.summaryPath, `${JSON.stringify(payload)}\n`);
  const cleaned = cleanup(payload, { temporaryRoot: root });
  assert.equal(cleaned.code, 'cleanup.removed');
  assert.equal(fs.existsSync(evidence.lifecycle.cleanupReference), false);
  assert.equal(cleanup(payload, { temporaryRoot: root }).code, 'cleanup.already_absent');
});

test('旧 verification-run summary 不再被 cleanup reader 接受', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const evidence = createVerificationEvidenceLifecycle('legacy-1', { temporaryRoot: root });
  const payload = { ...summary('legacy-1', evidence), schemaVersion: 'buildr.verification-run/v1' };
  fs.writeFileSync(evidence.summaryPath, `${JSON.stringify(payload)}\n`);
  const normalized = normalizeVerificationEvidenceLifecycle(payload);
  assert.equal(normalized.compatibilitySource, null);
  assert.equal(normalized.lifecycle, evidence.lifecycle);
  assert.equal(cleanup(payload, { temporaryRoot: root }).code, 'cleanup.schema_invalid');
  assert.equal(fs.existsSync(evidence.summaryPath), true);
});

test('cleanup rejects run mismatch, caller-managed evidence and boundary escape', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const managed = {
    summaryPath: path.join(root, 'managed.json'),
    lifecycle: { schemaVersion: 'buildr.verification-evidence-lifecycle/v1', runId: 'managed-1', evidenceRetention: 'caller-managed', cleanupAfter: 'caller-policy', cleanupStatus: 'not-applicable', cleanupReference: null, summaryPath: path.join(root, 'managed.json') },
  };
  assert.equal(cleanup(summary('managed-1', managed), { temporaryRoot: root }).code, 'retention.not_transient');

  const transient = createVerificationEvidenceLifecycle('run-2', { temporaryRoot: root });
  const mismatch = summary('run-2', transient);
  mismatch.evidenceLifecycle = { ...mismatch.evidenceLifecycle, runId: 'other' };
  assert.equal(cleanup(mismatch, { temporaryRoot: root }).code, 'cleanup.run_identity_mismatch');

  const escaped = summary('run-2', transient);
  escaped.evidenceLifecycle = { ...escaped.evidenceLifecycle, cleanupReference: root, summaryPath: path.join(root, 'summary.json') };
  assert.equal(cleanup(escaped, { temporaryRoot: root }).code, 'cleanup.boundary_invalid');
});

test('public retry proves only an absent exact transient run boundary', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const absent = path.join(root, 'buildr-verification-run-absent', 'summary.json');
  assert.equal(cleanupAbsentVerificationEvidence(absent, { temporaryRoot: root }).code, 'cleanup.already_absent');
  assert.equal(cleanupAbsentVerificationEvidence(path.join(root, 'other', 'summary.json'), { temporaryRoot: root }).code, 'cleanup.summary_missing');
  fs.mkdirSync(path.dirname(absent), { recursive: true });
  assert.equal(cleanupAbsentVerificationEvidence(absent, { temporaryRoot: root }).code, 'cleanup.summary_missing');
});
