import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const VERIFICATION_EVIDENCE_LIFECYCLE_SCHEMA = 'buildr.verification-evidence-lifecycle/v1';

function transientSummaryBoundary(summaryPath, temporaryRoot = os.tmpdir()) {
  const resolvedSummary = path.resolve(summaryPath);
  const cleanupReference = path.dirname(resolvedSummary);
  const root = path.resolve(temporaryRoot);
  const relative = path.relative(root, cleanupReference);
  return {
    cleanupReference,
    resolvedSummary,
    safe: Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
      && path.basename(cleanupReference).startsWith('buildr-verification-run-')
      && path.basename(resolvedSummary) === 'summary.json',
  };
}

export function createVerificationEvidenceLifecycle(runId, options = {}) {
  const temporaryRoot = path.resolve(options.temporaryRoot || os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'buildr-verification-run-'));
  const summaryPath = path.join(directory, 'summary.json');
  return {
    summaryPath,
    lifecycle: {
      schemaVersion: VERIFICATION_EVIDENCE_LIFECYCLE_SCHEMA,
      runId,
      evidenceRetention: 'transient',
      cleanupAfter: 'all-consumers-complete',
      cleanupStatus: 'retained',
      cleanupReference: directory,
      summaryPath,
    },
  };
}

export function normalizeVerificationEvidenceLifecycle(summary) {
  if (summary?.evidenceLifecycle?.schemaVersion === VERIFICATION_EVIDENCE_LIFECYCLE_SCHEMA) {
    return { lifecycle: summary.evidenceLifecycle, compatibilitySource: null };
  }
  return { lifecycle: null, compatibilitySource: null };
}

export function cleanupAbsentVerificationEvidence(summaryPath, options = {}) {
  const boundary = transientSummaryBoundary(summaryPath, options.temporaryRoot);
  if (!boundary.safe || fs.existsSync(boundary.cleanupReference)) {
    return { ok: false, status: 'retained', code: 'cleanup.summary_missing', message: 'Missing summary does not prove an already-absent provider-owned transient run.' };
  }
  return { ok: true, status: 'cleaned', code: 'cleanup.already_absent', cleanupReference: boundary.cleanupReference, compatibilitySource: null };
}

export function cleanupVerificationEvidence(summary, options = {}) {
  if (summary?.schemaVersion !== 'buildr.verification-execution/v1') {
    return { ok: false, status: 'retained', code: 'cleanup.schema_invalid', message: 'Evidence is not a buildr.verification-execution/v1 summary.' };
  }
  const { lifecycle, compatibilitySource } = normalizeVerificationEvidenceLifecycle(summary);
  if (lifecycle?.evidenceRetention !== 'transient') {
    return { ok: false, status: lifecycle?.cleanupStatus || 'retained', code: 'retention.not_transient', message: 'Evidence is not provider-managed transient data.' };
  }
  if (lifecycle.cleanupStatus !== 'retained') {
    return { ok: false, status: lifecycle.cleanupStatus, code: 'cleanup.not_retained', message: 'Evidence is not in retained state.' };
  }
  const runId = summary.runId || summary.run?.id || null;
  if (!runId || lifecycle.runId !== runId) {
    return { ok: false, status: 'retained', code: 'cleanup.run_identity_mismatch', message: 'Evidence lifecycle does not match the verification run identity.' };
  }
  const cleanupReference = path.resolve(lifecycle.cleanupReference || '');
  const summaryPath = path.resolve(lifecycle.summaryPath || '');
  const boundary = transientSummaryBoundary(summaryPath, options.temporaryRoot);
  const safeBoundary = boundary.safe && boundary.cleanupReference === cleanupReference;
  if (!safeBoundary) {
    return { ok: false, status: 'retained', code: 'cleanup.boundary_invalid', message: 'Cleanup reference is outside the owned transient run boundary.' };
  }
  if (!fs.existsSync(cleanupReference)) {
    return { ok: true, status: 'cleaned', code: 'cleanup.already_absent', cleanupReference, compatibilitySource };
  }
  const stat = fs.lstatSync(cleanupReference);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return { ok: false, status: 'retained', code: 'cleanup.target_invalid', message: 'Cleanup reference is not an owned directory.' };
  }
  if (!fs.existsSync(summaryPath) || fs.lstatSync(summaryPath).isSymbolicLink()) {
    return { ok: false, status: 'retained', code: 'cleanup.summary_invalid', message: 'Cleanup directory does not contain the bound summary file.' };
  }
  if (typeof options.removePath !== 'function') {
    return { ok: false, status: 'retained', code: 'cleanup.mutation_unavailable', message: 'The managed evidence cleanup capability is unavailable.' };
  }
  options.removePath(cleanupReference);
  return { ok: true, status: 'cleaned', code: 'cleanup.removed', cleanupReference, compatibilitySource };
}
