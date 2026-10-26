#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectChangedProductPaths } from './changed-paths.ts';
import { createVerificationPlan } from './planner.ts';
import { executePlan } from './plan-runner.ts';
import { resolveVerificationExecutionProfile, verificationSteps } from './registry.ts';
import { collectVerificationSourceIdentity, createVerificationEvidencePaths, writeVerificationTimingEvidence } from './timing/evidence.ts';

const productRoot = path.resolve(import.meta.dirname, '../..');
const projectRoot = path.resolve(productRoot, '../..');
const modes: Record<string, string[]> = { unit: ['Unit'], static: ['Static'], integration: ['Integration'], e2e: ['E2E'], check: ['Static', 'Unit'], related: [] };

export function parseVerificationArguments(args: string[]) {
  const mode = args[0];
  if (!Object.hasOwn(modes, mode)) throw new Error('Choose unit, static, integration, e2e, check or related.');
  const request = { mode, checks: [] as string[], base: null as string | null, planOnly: false, json: false, help: false, list: false, reference: null as string | null };
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--plan') request.planOnly = true;
    else if (arg === '--json') { request.planOnly = true; request.json = true; }
    else if (arg === '--help' || arg === '-h') request.help = true;
    else if (arg === '--list') { request.planOnly = true; request.list = true; }
    else if (arg === '--check' || arg === '--base') {
      const value = args[++index];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires a value.`);
      if (arg === '--check') request.checks.push(value);
      else { if (request.base) throw new Error('--base may only be supplied once.'); request.base = value; }
    } else throw new Error(`Unknown verification option: ${arg}`);
  }
  request.checks = [...new Set(request.checks)];
  if (request.base && !['related', 'check', 'static'].includes(mode)) throw new Error('--base supplies comparison context to static/check, or changed-path selection to related.');
  if (mode === 'related' && !request.base && !request.checks.length && !request.help && !request.list) throw new Error('test:related requires --base <ref> or one or more explicit --check <id>.');
  return request;
}

export function checkAvailability(step: any, env: NodeJS.ProcessEnv = process.env, platform = process.platform) {
  const gaps: any[] = [];
  for (const variable of step.requiredEnvironment ?? []) if (!env[variable]) gaps.push({ code: 'required-environment-missing', checkId: step.id, variable, reason: `Prepare ${variable} explicitly; verification does not download or activate external runtimes.` });
  for (const file of step.requiresFiles ?? []) if (!fs.existsSync(file)) gaps.push({ code: 'required-file-missing', checkId: step.id, file, reason: 'A declared input is unavailable.' });
  const runner = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : platform;
  if (step.platformScope?.kind === 'platform' && !step.platformScope.runners.includes(runner)) gaps.push({ code: 'different-platform-required', checkId: step.id, platforms: step.platformScope.runners, reason: 'Only execution on the declared real operating system proves this check.' });
  if (step.platforms?.length && !step.platforms.includes(platform)) gaps.push({ code: 'different-platform-required', checkId: step.id, platforms: step.platforms, reason: 'The check requires another real operating system.' });
  if (step.target === 'artifact') gaps.push({ code: 'exact-artifact-required', checkId: step.id, reason: 'Use the release owner with the exact package; a source check never silently creates a replacement package.' });
  return gaps;
}

export function verificationCoverageEntry(step: any, result: any, platform = process.platform) {
  const executed = result && result.status !== 'blocked';
  const requiredPlatforms = step.platformScope?.kind === 'platform'
    ? step.platformScope.runners.map((runner: string) => runner === 'macos' ? 'darwin' : runner === 'windows' ? 'win32' : runner)
    : step.platforms ?? [];
  return { id: step.id, type: step.testing.executionBoundary, target: step.target,
    availability: result?.status === 'blocked' ? 'unavailable' : step.availability, requiredPlatforms,
    proofPlatform: executed ? result.reusedFrom?.environment?.platform ?? platform : null,
    exitCode: executed ? result.exitCode ?? null : null,
    status: result?.status ?? (step.availability === 'unavailable' ? 'unavailable' : 'not-run'),
    disposition: result?.reusedFrom ? 'reused' : executed ? 'executed' : 'not-run' };
}

export function planVerification(request: ReturnType<typeof parseVerificationArguments>, options: any = {}) {
  const steps = options.steps ?? verificationSteps;
  const changed = request.base && request.mode === 'related' ? (options.collectChanged ?? collectChangedProductPaths)({ productRoot: options.productRoot ?? productRoot, projectRoot: options.projectRoot ?? projectRoot, base: request.base }) : { paths: [], base: null };
  const plan = createVerificationPlan({ ...changed, types: modes[request.mode], stepIds: request.checks, target: 'source', related: request.mode === 'related', completeTypes: request.mode === 'check' }, steps);
  const selectedIds = new Set(plan.steps.map((step: any) => step.id));
  const targetExclusions = steps.filter((step: any) => step.target === 'artifact' && !selectedIds.has(step.id)
    && (!modes[request.mode].length || modes[request.mode].includes(step.testing.executionBoundary))).map((step: any) => ({
      id: step.id, name: step.name, type: step.testing.executionBoundary, target: 'artifact',
      reason: 'The default scope proves current source. This check requires the release owner and its exact immutable package; no package result is implied by source completion.',
    }));
  const selectionExclusions = request.mode !== 'related' && (!request.checks.length || request.mode === 'check')
    ? steps.filter((step: any) => step.selection === 'explicit-only' && step.target === 'source' && !selectedIds.has(step.id)
      && modes[request.mode].includes(step.testing.executionBoundary)).map((step: any) => ({
        id: step.id, name: step.name, type: step.testing.executionBoundary, target: step.target,
        reason: (step.requirements ?? []).join(' ') || 'Supplementary explicit check; its primary source owner provides ordinary full coverage.',
      })) : [];
  const gaps = [...plan.gaps];
  const unavailable = new Set<string>();
  for (const step of plan.steps) {
    const missing = checkAvailability(step, { ...(options.env ?? process.env), ...(request.base ? { BUILDR_VERIFICATION_BASE: request.base } : {}) }, options.platform ?? process.platform);
    if (missing.length) { unavailable.add(step.id); gaps.push(...missing); }
  }
  let changedDependencies = true;
  while (changedDependencies) {
    changedDependencies = false;
    for (const step of plan.steps) if (!unavailable.has(step.id) && step.dependsOn.some((id: string) => unavailable.has(id))) {
      unavailable.add(step.id); changedDependencies = true;
      gaps.push({ code: 'dependency-unavailable', checkId: step.id, dependencies: step.dependsOn.filter((id: string) => unavailable.has(id)), reason: 'A required producer cannot execute in this environment.' });
    }
  }
  return { ...plan, targetExclusions, selectionExclusions, status: gaps.length ? 'incomplete' : 'ready', gaps, mode: request.mode, selection: request.mode === 'related' ? request.base ? 'related-plus-explicit' : 'explicit' : request.mode === 'check' || !request.checks.length ? 'full' : 'explicit', base: changed.base ?? request.base, reference: request.reference, steps: plan.steps.map((step: any) => ({ ...step, availability: unavailable.has(step.id) ? 'unavailable' : 'ready' })) };
}

function print(plan: any) {
  process.stdout.write(`Verification: ${plan.mode} selection=${plan.selection} target=${plan.target} status=${plan.status}\n`);
  if (plan.base) process.stdout.write(`Comparison: reference=${plan.reference ?? plan.base} commit=${plan.base}\n`);
  for (const step of plan.steps) {
    process.stdout.write(`${step.availability} ${step.testing.executionBoundary} ${step.id} — ${step.name}\n`);
    const executor = step.executor;
    const entry = executor.type === 'command' ? executor.file
      : executor.type === 'node' ? `${process.execPath} ${path.resolve(productRoot, executor.file)}`
      : executor.type === 'npm' ? 'npm'
      : executor.type === 'openspec' ? path.join(productRoot, 'node_modules/.bin/openspec')
      : executor.type === 'node-test' ? `${process.execPath} --test`
      : executor.type === 'node-context-test' ? `${process.execPath} ${path.join(productRoot, 'build/test-context/node-runner-cli.js')}`
      : executor.type === 'package-selector' ? `${process.execPath} ${path.join(productRoot, 'test/verification/package/run.ts')} ${executor.selector}`
      : executor.type === 'workspace-suite' ? `${process.execPath} ${path.join(productRoot, 'test/verification/workspace', `${executor.selector}.ts`)}`
      : executor.type;
    process.stdout.write(`  execute: ${entry} ${(executor.args ?? []).map((arg: string) => JSON.stringify(arg)).join(' ')} (cwd=${executor.cwd ?? (executor.type === 'openspec' ? projectRoot : productRoot)})\n`);
    if (executor.files?.length) process.stdout.write(`  files: ${executor.files.join(', ')}\n`);
    if (executor.selector) process.stdout.write(`  selector: ${executor.selector}\n`);
    for (const reason of step.reasons ?? []) process.stdout.write(`  selected: ${reason}\n`);
    for (const item of step.preparations ?? []) process.stdout.write(`  prepare once: ${item.file} ${(item.args ?? []).join(' ')} (cwd=${item.cwd})\n`);
    for (const requirement of step.requirements ?? []) process.stdout.write(`  requires: ${requirement}\n`);
  }
  for (const item of plan.selectionExclusions) process.stdout.write(`supplementary check excluded: ${item.type} ${item.id} — ${item.reason}\n`);
  for (const item of plan.targetExclusions) process.stdout.write(`target excluded: ${item.type} ${item.id} — ${item.reason}\n`);
  for (const gap of plan.gaps) process.stdout.write(`gap: ${JSON.stringify(gap)}\n`);
}

export async function main(args = process.argv.slice(2)) {
  const request = parseVerificationArguments(args);
  if (request.help) {
    process.stdout.write('npm test | npm run check | npm run test:static|test:integration|test:e2e|test:related\nOptions: --plan, --json, repeatable --check <id>, --list; test:related --base <ref> adds affected checks.\ncheck always includes every source Static and Unit check; explicit checks never narrow that set.\n');
    return 0;
  }
  if (request.list) { process.stdout.write(`${JSON.stringify(verificationSteps.map((step: any) => ({ id: step.id, type: step.testing.executionBoundary, target: step.target, name: step.name })), null, 2)}\n`); return 0; }
  const reference = request.base ?? (['check', 'static'].includes(request.mode) ? process.env.BUILDR_VERIFICATION_BASE || 'HEAD' : null);
  if (reference) { request.reference = reference; request.base = execFileSync('git', ['rev-parse', '--verify', `${reference}^{commit}`], { cwd: productRoot, encoding: 'utf8' }).trim(); }
  const plan = planVerification(request);
  if (request.json) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  else print(plan);
  if (request.planOnly) return plan.status === 'ready' ? 0 : 1;
  const runnable = { ...plan, steps: plan.steps.filter((step: any) => step.availability === 'ready') };
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-'));
  const evidence = createVerificationEvidencePaths(request.mode);
  const source = collectVerificationSourceIdentity(productRoot, { projectRoot });
  const startedAt = Date.now();
  const executionProfile = resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE);
  let execution: any = { passed: false, results: [] };
  let executionError: string | null = null;
  try {
    execution = await executePlan(runnable, {
      productRoot, projectRoot, diagnosticsDirectory: evidence.diagnosticsOutput, artifactDirectory: path.join(temporaryRoot, 'artifacts'),
      env: { ...process.env, ...(request.base ? { BUILDR_VERIFICATION_BASE: request.base } : {}), BUILDR_CHANGED_PATHS_JSON: JSON.stringify(plan.paths) },
      executionProfile, concurrency: executionProfile.limits, runId: evidence.runId,
      taskId: process.env.BUILDR_TASK_ID ?? source.branch ?? request.mode, stream: process.stdout, errorStream: process.stderr,
    });
  } catch (error: any) { executionError = error.stack ?? error.message; process.stderr.write(`${executionError}\n`); }
  finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
  const runtimeGaps = execution.results.filter((result: any) => result.status === 'blocked').map((result: any) => ({ code: 'execution-unavailable', checkId: result.id, reason: result.reason }));
  const gaps = [...plan.gaps, ...runtimeGaps, ...(executionError ? [{ code: 'execution-interrupted', reason: executionError }] : [])];
  const coverage = {
    mode: plan.mode, selection: plan.selection, target: plan.target, reference: plan.reference, base: plan.base, targetExclusions: plan.targetExclusions, selectionExclusions: plan.selectionExclusions,
    selected: plan.steps.map((step: any) => {
      const result = execution.results.find((item: any) => item.id === step.id);
      return verificationCoverageEntry(step, result);
    }),
    gaps, selectedCount: plan.steps.length,
    executedCount: execution.results.filter((result: any) => !result.reusedFrom && result.status !== 'blocked').length,
    reusedCount: execution.results.filter((result: any) => result.reusedFrom).length,
    unavailableCount: plan.steps.filter((step: any) => step.availability !== 'ready').length + runtimeGaps.length,
  };
  const failedCount = execution.results.filter((result: any) => !['passed', 'blocked'].includes(result.status)).length;
  const notRunCount = coverage.selected.filter((item: any) => item.status === 'not-run').length;
  const conclusion = failedCount ? 'not-passed' : gaps.length || notRunCount || !execution.passed ? 'incomplete' : 'passed';
  Object.assign(coverage, { conclusion, failedCount, notRunCount });
  const passed = conclusion === 'passed';
  writeVerificationTimingEvidence({ ...evidence, kind: request.mode, source, coverage,
    status: passed ? 'passed' : 'failed', results: execution.results, contextLifecycle: execution.contextLifecycle,
    startedAt, finishedAt: Date.now(), diagnosticsDirectory: evidence.diagnosticsOutput, prefix: 'verify',
    stream: process.stdout, errorStream: process.stderr, executionProfile });
  process.stdout.write(`Verification ${conclusion}: selected=${coverage.selectedCount} executed=${coverage.executedCount} reused=${coverage.reusedCount} failed=${failedCount} unavailable=${coverage.unavailableCount} not-run=${notRunCount} gaps=${gaps.length}.\n`);
  return passed ? 0 : 1;

}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error: any) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 2; }
}
