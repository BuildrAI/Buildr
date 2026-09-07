import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const FINGERPRINT_ALGORITHM: any = 'sha256-git-head-diff-untracked-v1';

function gitBuffer(args: any, cwd: any): any  {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

function gitText(args: any, cwd: any): any  {
  return gitBuffer(args, cwd).toString('utf8').trim();
}

export function createVerificationRunId(kind: any): any  {
  const stamp: any = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `${kind}-${stamp}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
}

export function createVerificationEvidencePaths(kind: any, options: any = {}): any  {
  const env: any = options.env ?? process.env;
  const temporaryRoot: any = options.temporaryRoot ?? os.tmpdir();
  const runId: any = createVerificationRunId(kind);
  const timingOutput: any = env.BUILDR_TIMING_OUTPUT
    ? path.resolve(env.BUILDR_TIMING_OUTPUT)
    : path.join(fs.mkdtempSync(path.join(temporaryRoot, `buildr-${kind}-evidence-`)), 'timing.json');
  const evidenceDirectory: any = path.dirname(timingOutput);
  const diagnosticsOutput: any = env.BUILDR_DIAGNOSTICS_OUTPUT
    ? path.resolve(env.BUILDR_DIAGNOSTICS_OUTPUT)
    : env.BUILDR_TIMING_OUTPUT
      ? timingOutput.replace(/\.json$/, '') + '-diagnostics'
      : path.join(evidenceDirectory, 'diagnostics');
  const providerManaged: any = !env.BUILDR_TIMING_OUTPUT;
  const evidenceLifecycle: any = providerManaged
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

export function collectVerificationSourceIdentity(productRoot: any, options: any = {}): any  {
  const resolvedProductRoot: any = path.resolve(productRoot);
  const resolvedProjectRoot: any = path.resolve(options.projectRoot ?? resolvedProductRoot);
  const repositoryRoot: any = gitText(['rev-parse', '--show-toplevel'], resolvedProductRoot);
  const head: any = gitText(['rev-parse', 'HEAD'], resolvedProductRoot);
  const branch: any = gitText(['branch', '--show-current'], resolvedProductRoot) || null;
  const status: any = gitBuffer(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'], resolvedProjectRoot);
  const trackedDiff: any = gitBuffer(['diff', '--binary', 'HEAD', '--', '.'], resolvedProjectRoot);
  const untracked: any = gitBuffer(['ls-files', '--full-name', '--others', '--exclude-standard', '-z', '--', '.'], resolvedProjectRoot)
    .toString('utf8').split('\0').filter(Boolean).sort();
  const fingerprint: any = crypto.createHash('sha256');
  fingerprint.update(`${FINGERPRINT_ALGORITHM}\0${head}\0${path.relative(repositoryRoot, resolvedProjectRoot)}\0`);
  fingerprint.update(trackedDiff);
  for (const relative of untracked) {
    const file: any = path.join(repositoryRoot, relative);
    const stat: any = fs.lstatSync(file);
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

function normalizedSteps(results: any): any  {
  return results.map((result: any) => ({
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
    ...(result.scheduling ? { scheduling: result.scheduling } : {}),
    ...(result.resourceCoordination ? { resourceCoordination: result.resourceCoordination } : {}),
    ...(result.failureCode ? { failureCode: result.failureCode } : {}),
    ...(result.processCleanup ? { processCleanup: result.processCleanup } : {}),
    ...(result.phases?.length ? { phases: result.phases } : {}),
    ...(result.testContextRuntime ? { testContextRuntime: result.testContextRuntime } : {}),
  }));
}

export function createVerificationTimingSummary(options: any): any  {
  const steps: any = normalizedSteps(options.results ?? []);
  const summary: any = {
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
    ...(options.contextLifecycle ? { contextLifecycle: options.contextLifecycle } : {}),
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

function seconds(milliseconds: any): any  {
  return `${(milliseconds / 1000).toFixed(3)}s`;
}

export function formatVerificationTimingSummary(summary: any, prefix: any = 'verify'): any  {
  const slowest: any = [...summary.steps].sort((left: any, right: any) => right.durationMs - left.durationMs)[0] ?? null;
  const failed: any = summary.steps.filter((step: any) => step.status === 'failed');
  const budget: any = summary.budgetStatus ? ` budget=${summary.budgetStatus}/${seconds(summary.budgetMs)}` : '';
  const lines: any[] = [
    `[${prefix}] timing: total=${seconds(summary.totalDurationMs)}${budget}`,
    `[${prefix}] slowest: ${slowest ? `${slowest.name} (${seconds(slowest.durationMs)})` : 'none'}`,
    `[${prefix}] failed: ${failed.length > 0 ? failed.map((step: any) => `${step.name} (${step.exitCode})`).join(', ') : 'none'}`,
    `[${prefix}] timing summary: ${summary.summaryPath}`,
  ];
  if (summary.evidenceLifecycle) {
    lines.push(`[${prefix}] evidence: retention=${summary.evidenceLifecycle.evidenceRetention} cleanup=${summary.evidenceLifecycle.cleanupStatus} after=${summary.evidenceLifecycle.cleanupAfter}`);
  }
  return lines;
}

export function cleanupVerificationTimingEvidence(summary: any, options: any = {}): any  {
  const lifecycle: any = summary?.evidenceLifecycle;
  if (lifecycle?.evidenceRetention !== 'transient') {
    return { ok: false, status: 'retained', code: 'retention.not_transient', message: 'Evidence is not provider-managed transient data.' };
  }
  if (lifecycle.cleanupStatus !== 'retained') {
    return { ok: false, status: lifecycle.cleanupStatus, code: 'cleanup.not_retained', message: 'Evidence is not in retained state.' };
  }
  const temporaryRoot: any = path.resolve(options.temporaryRoot ?? os.tmpdir());
  const cleanupReference: any = path.resolve(lifecycle.cleanupReference ?? '');
  const summaryPath: any = path.resolve(summary.summaryPath ?? '');
  const expectedPrefix: any = `buildr-${summary?.run?.kind}-evidence-`;
  const relative: any = path.relative(temporaryRoot, cleanupReference);
  const safeBoundary: any = relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    && path.basename(cleanupReference).startsWith(expectedPrefix)
    && path.dirname(summaryPath) === cleanupReference
    && path.basename(summaryPath) === 'timing.json';
  if (!safeBoundary) {
    return { ok: false, status: 'retained', code: 'cleanup.boundary_invalid', message: 'Cleanup reference is outside the owned transient run boundary.' };
  }
  if (!fs.existsSync(cleanupReference)) {
    return { ok: true, status: 'cleaned', code: 'cleanup.already_absent', cleanupReference };
  }
  const stat: any = fs.lstatSync(cleanupReference);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return { ok: false, status: 'retained', code: 'cleanup.target_invalid', message: 'Cleanup reference is not an owned directory.' };
  }
  fs.rmSync(cleanupReference, { recursive: true, force: false });
  return { ok: true, status: 'cleaned', code: 'cleanup.removed', cleanupReference };
}

export function validateVerificationTimingEvidence(summary: any, currentSource: any, expectedKind: any = 'candidate'): any  {
  const findings: any[] = [];
  const expect: any = (condition: any, code: any, message: any) => {
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

export function writeVerificationTimingEvidence(options: any): any  {
  const summary: any = createVerificationTimingSummary(options);
  fs.mkdirSync(path.dirname(summary.summaryPath), { recursive: true });
  fs.writeFileSync(summary.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  for (const line of formatVerificationTimingSummary(summary, options.prefix)) options.stream?.write(`${line}\n`);
  for (const step of summary.steps.filter((item: any) => item.budgetStatus === 'over')) {
    options.errorStream?.write(`[${options.prefix}] warning: ${step.name} exceeded ${step.budgetMs} ms target budget.\n`);
  }
  if (summary.budgetStatus === 'over') {
    options.errorStream?.write(`[${options.prefix}] warning: ${options.kind} exceeded ${summary.budgetMs} ms target budget.\n`);
  }
  return summary;
}
