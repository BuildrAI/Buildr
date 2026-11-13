#!/usr/bin/env node
import { collectVerificationContentSnapshot } from './content-snapshot.ts';
import { readFailedVerificationGroups } from './failed-groups.ts';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectChangedProductPaths, collectImpactSnapshot, contentChangesAtSnapshot } from './changed-paths.ts';
import { estimateVerificationPlan } from './planner.ts';
import { createVerificationPlan, budgetRelatedVerificationPlan } from './planner.ts';
import { executePlan, localExecutionStep } from './plan-runner.ts';
import { resolveVerificationExecutionProfile, verificationSteps } from './registry.ts';
import { collectVerificationSourceIdentity, createVerificationEvidencePaths, writeVerificationTimingEvidence } from './timing/evidence.ts';
import { createIsolatedWorkspaceState } from '../../tools/development/isolated-workspace-state.ts';

const productRoot = path.resolve(import.meta.dirname, '../..');
const projectRoot = path.resolve(productRoot, '../..');
const modes: Record<string, string[]> = { unit: ['Unit'], static: ['Static'], integration: ['Integration'], e2e: ['E2E'], system: ['Integration', 'E2E'], check: ['Static', 'Unit'], related: [] };

export function parseVerificationArguments(args: string[]) {
  const mode = args[0];
  if (!Object.hasOwn(modes, mode)) throw new Error('Choose unit, static, integration, e2e, system, check or related.');
  const request = { mode, checks: [] as string[], tags: [] as string[], excludeGroups: [] as string[], failedFrom: null as string | null, semantic: false, base: null as string | null, planOnly: false, json: false, help: false, list: false, reference: null as string | null };
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--semantic') request.semantic = true;
    else if (arg === '--plan') request.planOnly = true;
    else if (arg === '--json') { request.planOnly = true; request.json = true; }
    else if (arg === '--help' || arg === '-h') request.help = true;
    else if (arg === '--list') { request.planOnly = true; request.list = true; }
    else if (arg === '--check' || arg === '--base' || arg === '--tag' || arg === '--without-group' || arg === '--failed-from') {
      const value = args[++index];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires a value.`);
      if (arg === '--check') request.checks.push(value);
      else if (arg === '--tag') request.tags.push(value);
      else if (arg === '--without-group') request.excludeGroups.push(value);
      else if (arg === '--failed-from') { if (request.failedFrom) throw new Error('--failed-from may only be supplied once.'); request.failedFrom = value; }
      else { if (request.base) throw new Error('--base may only be supplied once.'); request.base = value; }
    } else throw new Error(`Unknown verification option: ${arg}`);
  }
  request.checks = [...new Set(request.checks)];
  request.excludeGroups = [...new Set(request.excludeGroups)];
  if (request.base && !['related', 'check', 'static'].includes(mode)) throw new Error('--base supplies comparison context to static/check, or changed-path selection to related.');
  if ((request.tags.length || request.failedFrom || request.semantic) && mode !== 'related') throw new Error('Semantic and failure selection require related mode.');
  if (mode === 'related' && !request.base && !request.checks.length && !request.tags.length && !request.failedFrom && !request.help && !request.list) throw new Error('test:related requires --base <ref> or one or more explicit --check <id>.');
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

function focusedConversationCheck(step:any,env:NodeJS.ProcessEnv=process.env){
  return step.id==='e2e-browser:agent-conversations'&&Boolean(env.BUILDR_AGENT_SCENARIO_FOCUS?.trim()||env.BUILDR_AGENT_JOURNEY_BATCH||env.BUILDR_AGENT_JOURNEY_PART&&env.BUILDR_AGENT_JOURNEY_PART!=='all');
}

export function verificationCoverageEntry(step: any, result: any, platform = process.platform, env:NodeJS.ProcessEnv = process.env) {
  const focused=focusedConversationCheck(step,env);
  const executed = result && result.status !== 'blocked';
  const requiredPlatforms = step.platformScope?.kind === 'platform'
    ? step.platformScope.runners.map((runner: string) => runner === 'macos' ? 'darwin' : runner === 'windows' ? 'win32' : runner)
    : step.platforms ?? [];
  return { id: step.id, type: step.testing.executionBoundary, target: step.target,
    availability: result?.status === 'blocked' ? 'unavailable' : step.availability, requiredPlatforms,
    proofPlatform: executed ? result.reusedFrom?.environment?.platform ?? platform : null,
    exitCode: executed ? result.exitCode ?? null : null,
    status: result?.status ?? (step.availability === 'unavailable' ? 'unavailable' : 'not-run'),
    disposition: result?.reusedFrom ? 'reused' : executed ? 'executed' : 'not-run',...(focused?{scope:'focused'}:{}) };
}

export function planVerification(request: ReturnType<typeof parseVerificationArguments>, options: any = {}) {
  const steps = options.steps ?? verificationSteps;
  const executionProfile = options.executionProfile ?? resolveVerificationExecutionProfile(undefined, options.env ?? process.env);
  let changed = request.base && request.mode === 'related' ? (options.collectChanged ?? collectChangedProductPaths)({ productRoot: options.productRoot ?? productRoot, projectRoot: options.projectRoot ?? projectRoot, base: request.base }) : { paths: [], base: null };
  const previousEvidence = request.failedFrom ? JSON.parse(fs.readFileSync(request.failedFrom, 'utf8')) : null;
  const snapshotOptions = { productRoot: options.productRoot ?? productRoot, projectRoot: options.projectRoot ?? projectRoot };
  const previousSnapshot = previousEvidence?.coverage?.impactSnapshot;
  const snapshotBase = options.snapshotBase ?? request.base;
  const impactSnapshot = snapshotBase && (!request.planOnly || previousSnapshot) && !options.collectChanged
    ? previousSnapshot?.version === 1 ? collectImpactSnapshot(changed, snapshotOptions, previousSnapshot)
      : collectVerificationContentSnapshot({ ...snapshotOptions, base: snapshotBase, env: options.env, environmentInputs: steps.flatMap((step: any) => step.requiredEnvironment ?? []) }, previousSnapshot) : null;
  if (impactSnapshot && changed.contentChanges?.length && !previousSnapshot && !options.collectChanged) {
    // Discovery may precede an expensive snapshot. Re-read paths and bind the
    // bounded proofs to those exact bytes before omitting any behavior owner.
    changed = collectChangedProductPaths({ ...snapshotOptions, base: request.base });
    changed = { ...changed, contentChanges: contentChangesAtSnapshot(changed, impactSnapshot, snapshotOptions) };
  }
  const deliveryChanged = changed;
  if (impactSnapshot && previousEvidence?.coverage?.impactSnapshot) {
    const paths = impactSnapshot.changedSincePrevious;
    changed = { ...changed, paths, contentChanges: [], versionOnlyPackagePaths: (changed.versionOnlyPackagePaths ?? []).filter((file: string) => paths.includes(file)),
      selectionOnlyPaths: (changed.selectionOnlyPaths ?? []).filter((file: string) => paths.includes(file)),
      selectionReasons: (changed.selectionReasons ?? []).filter((item: any) => paths.includes(item.path)) };
  }
  const failedIds = request.failedFrom ? [...new Set<string>([...readFailedVerificationGroups(request.failedFrom, previousEvidence), ...(impactSnapshot?.environmentChanged ? previousEvidence.coverage.selected.map((step: any) => step.id) : [])])] : [];
  const discoveredPlan = createVerificationPlan({ ...changed, tags: request.tags, semantic: request.semantic, types: modes[request.mode], stepIds: [...new Set([...request.checks, ...failedIds])], target: 'source', related: request.mode === 'related', completeTypes: request.mode === 'check', excludeGroups: request.excludeGroups }, steps);
  const budgetedPlan = budgetRelatedVerificationPlan(discoveredPlan, request);
  const plan = { ...budgetedPlan, steps: budgetedPlan.steps.map((step: any) => localExecutionStep(step, executionProfile, executionProfile.limits)) };
  // Narrow execution after repairs, but recheck unresolved ownership against the
  // complete delivery diff. A previous mapping gap must never disappear as green.
  const deliveryGaps = previousEvidence?.coverage?.impactSnapshot
    ? createVerificationPlan({ ...deliveryChanged, target: 'source', related: true }, steps).gaps : [];
  const retainedGaps = (previousEvidence?.coverage?.gaps ?? []).filter((gap: any) => gap.code === 'unknown-check' && !steps.some((step: any) => step.id === gap.checkId));
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
  const gaps = [...new Map([...plan.gaps, ...deliveryGaps, ...retainedGaps].map((gap: any) => [JSON.stringify(gap), gap])).values()];
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
  return { ...plan, executionProfile, estimate: estimateVerificationPlan(plan, { concurrency: executionProfile.limits }), impactSnapshot, repair: request.failedFrom ? { evidence: path.resolve(request.failedFrom), failedIds, comparison: previousEvidence?.coverage?.impactSnapshot ? 'previous-run-contents' : 'delivery-base' } : null, targetExclusions, selectionExclusions, status: gaps.length ? 'incomplete' : 'ready', gaps, mode: request.mode, selection: plan.selectionBudget ? 'daily-targeted' : request.mode === 'related' ? request.base ? 'related-plus-explicit' : 'explicit' : request.mode === 'check' || !request.checks.length ? 'full' : 'explicit', base: changed.base ?? request.base, reference: request.reference, steps: plan.steps.map((step: any) => ({ ...step, ...(failedIds.includes(step.id) ? { reuse: false, reuseDisabledReason: 'previous-run-did-not-pass' } : {}), availability: unavailable.has(step.id) ? 'unavailable' : 'ready' })) };
}

function print(plan: any) {
  process.stdout.write(`Verification: ${plan.mode} selection=${plan.selection} target=${plan.target} status=${plan.status}\n`);
  if (plan.base) process.stdout.write(`Comparison: reference=${plan.reference ?? plan.base} commit=${plan.base}\n`);
  if (plan.selectionBudget) {
    process.stdout.write(`Daily budget: selected=${plan.steps.length}/${plan.selectionBudget.limit} candidates=${plan.selectionBudget.candidateCount}; proof scope=targeted, not full coverage.\n`);
    for (const item of plan.selectionBudget.deferred) process.stdout.write(`deferred: ${item.id} — ${item.reason}; selected by: ${item.reasons.join('; ')}\n`);
  }
  for (const step of plan.steps) {
    process.stdout.write(`${step.availability} ${step.testing.executionBoundary} ${step.id} — ${step.name}\n`);
    if (step.tags?.length) process.stdout.write(`  tags: ${step.tags.join(', ')}\n`);
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
  for (const refinement of plan.refinements ?? []) {
    process.stdout.write(`content refinement: ${refinement.path} ${refinement.kind}; behavioral edges omitted: ${refinement.skippedOwnerIds.join(', ') || 'none'}; explicit selections remain additive\n`);
  }
  if (plan.contentFallback) process.stdout.write(`content fallback: ${plan.contentFallback}\n`);
}

/** Keep the handler through evidence finalization; a second signal does not
 * bypass owned cleanup or replace the original reason for interruption. */
export async function withVerificationSignals<T>(run: (signal: AbortSignal) => Promise<T>, owner: Pick<import('node:events').EventEmitter, 'on' | 'off'> = process): Promise<T> {
  const controller = new AbortController();
  const interrupt = () => { if (!controller.signal.aborted) controller.abort('SIGINT'); };
  const terminate = () => { if (!controller.signal.aborted) controller.abort('SIGTERM'); };
  owner.on('SIGINT', interrupt);
  owner.on('SIGTERM', terminate);
  try { return await run(controller.signal); }
  finally { owner.off('SIGINT', interrupt); owner.off('SIGTERM', terminate); }
}

export async function main(args = process.argv.slice(2)) {
  return withVerificationSignals(async signal => {
    const result = await runVerification(args, signal);
    return signal.aborted ? signal.reason === 'SIGTERM' ? 143 : 130 : result;
  });
}

async function runVerification(args: string[], signal: AbortSignal) {
  const invocationStartedAt = Date.now();
  const request = parseVerificationArguments(args);
  if (request.help) {
    process.stdout.write('npm test | npm run check | npm run test:static|test:integration|test:e2e|test:system|test:related\nOptions: --plan, --json, repeatable --check <id>, --tag <semantic-tag>, --semantic, --failed-from <timing.json>, --list; test:related --base <ref> adds affected checks.\ncheck always includes every source Static and Unit check; explicit checks never narrow that set.\n');
    return 0;
  }
  if (request.list) { process.stdout.write(`${JSON.stringify(verificationSteps.map((step: any) => ({ id: step.id, type: step.testing.executionBoundary, target: step.target, name: step.name, tags: step.tags })), null, 2)}\n`); return 0; }
  const reference = request.base ?? process.env.BUILDR_VERIFICATION_BASE ?? 'HEAD';
  const snapshotBase = execFileSync('git', ['rev-parse', '--verify', `${reference}^{commit}`], { cwd: productRoot, encoding: 'utf8' }).trim();
  request.reference = reference;
  if (request.base || request.mode !== 'related') request.base = snapshotBase;
  const executionProfile = resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE);
  const plan = planVerification(request, { snapshotBase, executionProfile });
  if (request.json) {
    // Planning output is not run evidence. Keep full content inventories in the
    // execution report; repair planning still observes them before selection.
    const { files, ...snapshotSummary } = plan.impactSnapshot ?? {};
    process.stdout.write(`${JSON.stringify({ ...plan, impactSnapshot: plan.impactSnapshot
      ? { ...snapshotSummary, fileCount: files ? Object.keys(files).length : null } : null }, null, 2)}\n`);
  }
  else print(plan);
  if(!request.json&&plan.steps.some((step:any)=>focusedConversationCheck(step)))process.stdout.write('[verify] proof scope=focused: unselected conversation groups and scenarios remain unverified.\n');
  if (request.planOnly) return plan.status === 'ready' ? 0 : 1;
  const runnable = { ...plan, steps: plan.steps.filter((step: any) => step.availability === 'ready') };
  const source = collectVerificationSourceIdentity(productRoot, { projectRoot });
  const startedAt = Date.now();
  const evidence = createVerificationEvidencePaths(request.mode);
  const scratch = createIsolatedWorkspaceState();
  let execution: any = { passed: false, results: [] };
  let executionError: string | null = null;
  let cleanupError: string | null = null;
  try {
    execution = await executePlan(runnable, {
      productRoot, projectRoot, diagnosticsDirectory: evidence.diagnosticsOutput, artifactDirectory: path.join(scratch.root, 'artifacts'),
      env: { ...process.env, ...(request.base ? { BUILDR_VERIFICATION_BASE: request.base } : {}), BUILDR_CHANGED_PATHS_JSON: JSON.stringify(plan.paths) },
      executionProfile, concurrency: executionProfile.limits, runId: evidence.runId,
      signal,
      taskId: process.env.BUILDR_TASK_ID ?? source.branch ?? request.mode, stream: process.stdout, errorStream: process.stderr,
    });
  } catch (error: any) { executionError = error.stack ?? error.message; process.stderr.write(`${executionError}\n`); }
  finally {
    try { scratch.cleanup(); }
    catch (error) {
      cleanupError = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[verify] scratch cleanup deferred: ${cleanupError}\n`);
    }
  }
  const runtimeGaps = execution.results.filter((result: any) => result.status === 'blocked').map((result: any) => ({ code: 'execution-unavailable', checkId: result.id, reason: result.reason }));
  const gaps = [...plan.gaps, ...runtimeGaps, ...(signal.aborted ? [{ code: 'execution-interrupted', reason: `Verification cancelled by ${signal.reason}; unfinished checks remain unverified.` }] : []), ...(executionError ? [{ code: 'execution-interrupted', reason: executionError }] : []),
    ...(cleanupError ? [{ code: 'execution-cleanup-incomplete', reason: cleanupError }] : [])];
  const coverage = {
    repair: plan.repair, impactSnapshot: plan.impactSnapshot, mode: plan.mode, selection: plan.selection, target: plan.target, reference: plan.reference, base: plan.base, targetExclusions: plan.targetExclusions, selectionExclusions: plan.selectionExclusions,
    selectionBudget: plan.selectionBudget ?? null, proofScope: plan.selectionBudget ? 'targeted' : 'requested',
    selected: plan.steps.map((step: any) => {
      const result = execution.results.find((item: any) => item.id === step.id);
      return verificationCoverageEntry(step, result);
    }),
    gaps, selectedCount: plan.steps.length,
    executedCount: execution.results.filter((result: any) => !result.reusedFrom && result.status !== 'blocked').length,
    reusedCount: execution.results.filter((result: any) => result.reusedFrom).length,
    unavailableCount: plan.steps.filter((step: any) => step.availability !== 'ready').length + runtimeGaps.length,
  };
  const failedResults = execution.results.filter((result: any) => !['passed', 'blocked', 'cancelled'].includes(result.status));
  const evidenceInvalidatedCount = failedResults.filter((result: any) =>
    result.childOutcome === 'passed' && String(result.failureCode ?? '').startsWith('verification-reuse-')).length;
  const failedCount = failedResults.length;
  const notRunCount = coverage.selected.filter((item: any) => item.status === 'not-run').length;
  const conclusion = failedCount ? 'not-passed' : gaps.length || notRunCount || !execution.passed ? 'incomplete' : 'passed';
  Object.assign(coverage, { conclusion, failedCount, evidenceInvalidatedCount, notRunCount });
  const passed = conclusion === 'passed';
  writeVerificationTimingEvidence({ ...evidence, kind: request.mode, source, coverage,
    status: passed ? 'passed' : 'failed', results: execution.results, timings: { ...execution.timings, selectionMs: startedAt - invocationStartedAt, totalMs: Date.now() - invocationStartedAt }, contextLifecycle: execution.contextLifecycle,
    startedAt: invocationStartedAt, finishedAt: Date.now(), diagnosticsDirectory: evidence.diagnosticsOutput, prefix: 'verify',
    stream: process.stdout, errorStream: process.stderr, executionProfile });
  process.stdout.write(`Verification ${conclusion}${plan.selectionBudget ? ' (targeted, not full coverage)' : ''}: selected=${coverage.selectedCount} executed=${coverage.executedCount} reused=${coverage.reusedCount} failed=${failedCount} unavailable=${coverage.unavailableCount} not-run=${notRunCount} gaps=${gaps.length}.\n`);
  if (evidenceInvalidatedCount) process.stdout.write(`[verify] ${evidenceInvalidatedCount} successful child checks lost current evidence; see source drift and cleanup diagnostics.\n`);
  return passed ? 0 : 1;

}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error: any) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 2; }
}
