import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const FINGERPRINT_ALGORITHM = 'sha256-git-head-diff-untracked-v1';

function gitBuffer(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

function gitText(args, cwd) {
  return gitBuffer(args, cwd).toString('utf8').trim();
}

export function createVerificationRunId(kind) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `${kind}-${stamp}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
}

export function createVerificationEvidencePaths(kind, options = {}) {
  const env = options.env ?? process.env;
  const temporaryRoot = options.temporaryRoot ?? os.tmpdir();
  const runId = createVerificationRunId(kind);
  const timingOutput = env.BUILDR_TIMING_OUTPUT
    ? path.resolve(env.BUILDR_TIMING_OUTPUT)
    : path.join(fs.mkdtempSync(path.join(temporaryRoot, `buildr-${kind}-evidence-`)), 'timing.json');
  const evidenceDirectory = path.dirname(timingOutput);
  const diagnosticsOutput = env.BUILDR_DIAGNOSTICS_OUTPUT
    ? path.resolve(env.BUILDR_DIAGNOSTICS_OUTPUT)
    : env.BUILDR_TIMING_OUTPUT
      ? timingOutput.replace(/\.json$/, '') + '-diagnostics'
      : path.join(evidenceDirectory, 'diagnostics');
  const providerManaged = !env.BUILDR_TIMING_OUTPUT;
  const evidenceLifecycle = providerManaged
    ? {
        evidenceRetention: 'transient',
        cleanupAfter: 'consumer-finished',
        cleanupStatus: 'retained',
        cleanupReference: evidenceDirectory,
      }
    : {
        evidenceRetention: 'caller-managed',
        cleanupAfter: 'caller-policy',
        cleanupStatus: 'not-applicable',
      };
  return { runId, evidenceDirectory, timingOutput, diagnosticsOutput, evidenceLifecycle };
}

export function collectVerificationSourceIdentity(productRoot, options = {}) {
  const resolvedProductRoot = path.resolve(productRoot);
  const resolvedProjectRoot = path.resolve(options.projectRoot ?? resolvedProductRoot);
  const repositoryRoot = gitText(['rev-parse', '--show-toplevel'], resolvedProductRoot);
  const head = gitText(['rev-parse', 'HEAD'], resolvedProductRoot);
  const branch = gitText(['branch', '--show-current'], resolvedProductRoot) || null;
  const status = gitBuffer(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'], resolvedProjectRoot);
  const trackedDiff = gitBuffer(['diff', '--binary', 'HEAD', '--', '.'], resolvedProjectRoot);
  const untracked = gitBuffer(['ls-files', '--full-name', '--others', '--exclude-standard', '-z', '--', '.'], resolvedProjectRoot)
    .toString('utf8').split('\0').filter(Boolean).sort();
  const fingerprint = crypto.createHash('sha256');
  fingerprint.update(`${FINGERPRINT_ALGORITHM}\0${head}\0${path.relative(repositoryRoot, resolvedProjectRoot)}\0`);
  fingerprint.update(trackedDiff);
  for (const relative of untracked) {
    const file = path.join(repositoryRoot, relative);
    const stat = fs.lstatSync(file);
    fingerprint.update(`\0${relative}\0${stat.mode}\0`);
    fingerprint.update(stat.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file));
  }
  return {
    repositoryRoot,
    productRoot: resolvedProductRoot,
    packageRoot: resolvedProductRoot,
    projectRoot: resolvedProjectRoot,
    head,
    branch,
    dirty: status.length > 0,
    candidateFingerprint: `sha256-${fingerprint.digest('hex')}`,
    fingerprintAlgorithm: FINGERPRINT_ALGORITHM,
  };
}

function normalizedSteps(results) {
  return results.map((result) => ({
    name: result.name,
    status: result.status,
    exitCode: Number(result.exitCode ?? 0),
    durationMs: Number(result.durationMs),
    ...(result.budgetMs == null ? {} : {
      budgetMs: Number(result.budgetMs),
      budgetStatus: result.budgetStatus ?? (result.durationMs <= result.budgetMs ? 'within' : 'over'),
    }),
    ...(result.stdoutPath ? { stdoutPath: path.resolve(result.stdoutPath) } : {}),
    ...(result.stderrPath ? { stderrPath: path.resolve(result.stderrPath) } : {}),
    ...(result.queuedAt ? { queuedAt: result.queuedAt } : {}),
    ...(result.startedAt ? { startedAt: result.startedAt } : {}),
    ...(result.finishedAt ? { finishedAt: result.finishedAt } : {}),
    ...(result.blockedAt ? { blockedAt: result.blockedAt } : {}),
    ...(result.queueDurationMs == null ? {} : { queueDurationMs: Number(result.queueDurationMs) }),
    ...(result.resourceCoordination ? { resourceCoordination: result.resourceCoordination } : {}),
    ...(result.failureCode ? { failureCode: result.failureCode } : {}),
    ...(result.processCleanup ? { processCleanup: result.processCleanup } : {}),
  }));
}

export function createVerificationTimingSummary(options) {
  const steps = normalizedSteps(options.results ?? []);
  const summary = {
    schemaVersion: 'buildr.verification-timing/v1',
    status: options.status,
    run: {
      id: options.runId,
      kind: options.kind,
      startedAt: new Date(options.startedAt).toISOString(),
      finishedAt: new Date(options.finishedAt).toISOString(),
    },
    source: options.source,
    steps,
    totalDurationMs: Number(options.finishedAt - options.startedAt),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      ci: process.env.CI === 'true',
      ...(options.schedulingMode ? { schedulingMode: options.schedulingMode } : {}),
      ...(options.executionProfile ? {
        executionProfile: options.executionProfile.id,
        concurrency: options.executionProfile.limits,
      } : {}),
    },
    summaryPath: path.resolve(options.timingOutput),
    ...(options.evidenceLifecycle ? { evidenceLifecycle: options.evidenceLifecycle } : {}),
  };
  if (options.totalBudgetMs != null) {
    summary.budgetMs = Number(options.totalBudgetMs);
    summary.budgetStatus = summary.totalDurationMs <= summary.budgetMs ? 'within' : 'over';
  }
  if (options.diagnosticsDirectory && fs.existsSync(options.diagnosticsDirectory)) {
    summary.diagnosticsDirectory = path.resolve(options.diagnosticsDirectory);
  }
  return summary;
}

function seconds(milliseconds) {
  return `${(milliseconds / 1000).toFixed(3)}s`;
}

export function formatVerificationTimingSummary(summary, prefix = 'verify') {
  const slowest = [...summary.steps].sort((left, right) => right.durationMs - left.durationMs)[0] ?? null;
  const failed = summary.steps.filter((step) => step.status === 'failed');
  const budget = summary.budgetStatus ? ` budget=${summary.budgetStatus}/${seconds(summary.budgetMs)}` : '';
  const lines = [
    `[${prefix}] timing: total=${seconds(summary.totalDurationMs)}${budget}`,
    `[${prefix}] slowest: ${slowest ? `${slowest.name} (${seconds(slowest.durationMs)})` : 'none'}`,
    `[${prefix}] failed: ${failed.length > 0 ? failed.map((step) => `${step.name} (${step.exitCode})`).join(', ') : 'none'}`,
    `[${prefix}] timing summary: ${summary.summaryPath}`,
  ];
  if (summary.evidenceLifecycle) {
    lines.push(`[${prefix}] evidence: retention=${summary.evidenceLifecycle.evidenceRetention} cleanup=${summary.evidenceLifecycle.cleanupStatus} after=${summary.evidenceLifecycle.cleanupAfter}`);
  }
  return lines;
}

export function cleanupVerificationTimingEvidence(summary, options = {}) {
  const lifecycle = summary?.evidenceLifecycle;
  if (lifecycle?.evidenceRetention !== 'transient') {
    return { ok: false, status: 'retained', code: 'retention.not_transient', message: 'Evidence is not provider-managed transient data.' };
  }
  if (lifecycle.cleanupStatus !== 'retained') {
    return { ok: false, status: lifecycle.cleanupStatus, code: 'cleanup.not_retained', message: 'Evidence is not in retained state.' };
  }
  const temporaryRoot = path.resolve(options.temporaryRoot ?? os.tmpdir());
  const cleanupReference = path.resolve(lifecycle.cleanupReference ?? '');
  const summaryPath = path.resolve(summary.summaryPath ?? '');
  const expectedPrefix = `buildr-${summary?.run?.kind}-evidence-`;
  const relative = path.relative(temporaryRoot, cleanupReference);
  const safeBoundary = relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    && path.basename(cleanupReference).startsWith(expectedPrefix)
    && path.dirname(summaryPath) === cleanupReference
    && path.basename(summaryPath) === 'timing.json';
  if (!safeBoundary) {
    return { ok: false, status: 'retained', code: 'cleanup.boundary_invalid', message: 'Cleanup reference is outside the owned transient run boundary.' };
  }
  if (!fs.existsSync(cleanupReference)) {
    return { ok: true, status: 'cleaned', code: 'cleanup.already_absent', cleanupReference };
  }
  const stat = fs.lstatSync(cleanupReference);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return { ok: false, status: 'retained', code: 'cleanup.target_invalid', message: 'Cleanup reference is not an owned directory.' };
  }
  fs.rmSync(cleanupReference, { recursive: true, force: false });
  return { ok: true, status: 'cleaned', code: 'cleanup.removed', cleanupReference };
}

export function validateVerificationTimingEvidence(summary, currentSource, expectedKind = 'candidate') {
  const findings = [];
  const expect = (condition, code, message) => {
    if (!condition) findings.push({ code, message });
  };
  expect(summary?.schemaVersion === 'buildr.verification-timing/v1', 'schema.invalid', 'Timing summary schema is not buildr.verification-timing/v1.');
  expect(summary?.status === 'passed', 'status.not_passed', 'Timing summary status is not passed.');
  expect(summary?.run?.kind === expectedKind, 'run.kind_mismatch', `Timing summary run kind is not ${expectedKind}.`);
  for (const field of ['repositoryRoot', 'productRoot', 'projectRoot', 'head', 'candidateFingerprint', 'fingerprintAlgorithm']) {
    expect(summary?.source?.[field] === currentSource[field], `source.${field}_mismatch`, `Timing summary source ${field} does not match the current candidate.`);
  }
  return { ok: findings.length === 0, findings };
}

export function writeVerificationTimingEvidence(options) {
  const summary = createVerificationTimingSummary(options);
  fs.mkdirSync(path.dirname(summary.summaryPath), { recursive: true });
  fs.writeFileSync(summary.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  for (const line of formatVerificationTimingSummary(summary, options.prefix)) options.stream?.write(`${line}\n`);
  for (const step of summary.steps.filter((item) => item.budgetStatus === 'over')) {
    options.errorStream?.write(`[${options.prefix}] warning: ${step.name} exceeded ${step.budgetMs} ms target budget.\n`);
  }
  if (summary.budgetStatus === 'over') {
    options.errorStream?.write(`[${options.prefix}] warning: ${options.kind} exceeded ${summary.budgetMs} ms target budget.\n`);
  }
  return summary;
}
