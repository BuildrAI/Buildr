import os from 'node:os';
import { createCandidateRoundExecution } from './candidate-round.ts';
import path from 'node:path';
import { createTestContextPool } from '../context/runtime.ts';
import { runVerificationDag } from './dag-scheduler.ts';
import { createVerificationExecutor } from './executor.ts';
import { coordinatedResourcesFromLimits, createVerificationResourceCoordinator, resolveVerificationCoordinationRoot } from './resource-coordinator.ts';
import { VERIFICATION_CONCURRENCY } from './registry.ts';
import { createVerificationPlanReuse, reusedVerificationResult } from './verification-reuse.ts';

export function printPlan(plan: any, stream: any = process.stdout): any  {
  stream.write(`Verification plan: status=${plan.status ?? 'ready'} ${plan.steps.length} step(s)\n`);
  if (plan.paths.length > 0) {
    stream.write('Changed paths:\n');
    for (const item of plan.paths) stream.write(`  ${item}\n`);
  }
  for (const item of plan.delegated ?? []) stream.write(`Delegated: ${item.path} -> ${item.owners.join(', ')}\n`);
  if (plan.estimate) {
    stream.write(`Estimate: work=${plan.estimate.totalEstimatedDurationMs}ms minimum=${plan.estimate.minimumFeasibleDurationMs}ms\n`);
  }
  if (plan.diagnostic) stream.write(`Blocked: ${plan.diagnostic.code} — ${plan.diagnostic.message}\n`);
  for (const step of plan.steps) {
    stream.write(`\n${step.id} — ${step.name}\n`);
    for (const reason of step.reasons) stream.write(`  selected: ${reason}\n`);
    if (step.dependsOn.length > 0) stream.write(`  depends: ${step.dependsOn.join(', ')}\n`);
  }
}

/** Dependencies produced by owned preparation belong to the execution environment.
 * Freeze their proof after preparation, including checks made fresh by that change. */
export async function prepareVerificationReuse(plan: any, prepare: (steps: any[]) => Promise<void>, observe: () => any) {
  let reuse = observe();
  const prepared = new Set<string>();
  for (;;) {
    const pending = plan.steps.filter((step: any) => !prepared.has(step.id) && !reuse?.hits.has(step.id));
    if (!pending.length) return reuse;
    await prepare(pending);
    for (const step of pending) prepared.add(step.id);
    reuse = observe();
  }
}

/** Private lifecycle fixtures need IO headroom, not ownership of unrelated checks.
 * A bounded two-slot claim lets at most two heavy groups share a four-slot budget,
 * while capacity three or below keeps their previous mutual exclusion.
 * Keep worker grants unchanged: they also control actual child concurrency. */
export function localExecutionStep(step: any, profile: any, concurrency: any): any {
  if (!['local', 'local-auto'].includes(profile?.id)) return step;
  const agentProcess = step.service === 'buildr-agent'
    && step.testing?.executionBoundary === 'Integration' && step.resources?.includes('agent-process-tests');
  if (!agentProcess && !['integration-archify', 'e2e-nested-git'].includes(step.id)) return step;
  const workspaceIo = Number.isInteger(concurrency) ? concurrency : concurrency.capacities?.workspaceIo;
  if (!Number.isInteger(workspaceIo) || workspaceIo < 1) return step;
  return { ...step, concurrencyClass: 'workspace-heavy',
    resourceDemand: { ...step.resourceDemand, workspaceIo: Math.min(2, workspaceIo) } };
}

/** A verified cache hit executes no child and occupies no declared resources. */
export function reusedExecutionStep(step: any): any {
  return { ...step, resources: [], resourceClaims: [], resourceUnits: {}, concurrencyClass: 'default', resourceDemand: { workers: 1, processes: 1 } };
}

/** Run compatible browser selectors through one real host. The representative
 * keeps the browser slot and the other members wait on it without launching a
 * second server or browser. A single selected member never expands to its
 * bundle, so focused diagnosis keeps its original scope. */
export function bundleBrowserExecutionSteps(steps: any[], isReused: (id: string) => boolean = () => false): any {
  const groups = new Map<string, any[]>();
  for (const step of steps) {
    if (!step.browserBundle || isReused(step.id)) continue;
    const members = groups.get(step.browserBundle) ?? [];
    members.push(step);
    groups.set(step.browserBundle, members);
  }
  const replacements = new Map<string, any>();
  const coveredBy = new Map<string, string>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const selectors = members.map(member => member.browserSelector).filter(Boolean);
    if (selectors.length !== members.length) continue;
    const representative = members[0];
    const estimatedCostMs = members.reduce((total: number, member: any) => total + (member.schedulingCostMs ?? 0), 0);
    replacements.set(representative.id, {
      ...representative,
      browserSelectors: selectors,
      executor: { ...representative.executor, args: ['--selector', selectors.join(','), '--run'] },
      schedulingCostMs: estimatedCostMs,
      timeoutMs: Math.min(900_000, Math.max(600_000, estimatedCostMs + 120_000)),
    });
    for (const member of members.slice(1)) {
      replacements.set(member.id, {
        ...member,
        dependsOn: [...new Set([...(member.dependsOn ?? []), representative.id])],
        resources: [], resourceClaims: [], resourceUnits: {},
        concurrencyClass: 'default',
        resourceDemand: { workers: 1, processes: 1 },
      });
      coveredBy.set(member.id, representative.id);
    }
  }
  return { steps: steps.map(step => replacements.get(step.id) ?? step), coveredBy };
}

export async function executePlan(plan: any, options: any): Promise<any>  {
  if (plan.status === 'blocked') throw new Error(plan.diagnostic?.message ?? 'Verification plan is blocked.');
  const planStartedAt = Date.now();
  const timings: any = {};
  const prefix: any = options.prefix ?? 'verify';
  const diagnosticsDirectory: any = options.diagnosticsDirectory ?? path.join(os.tmpdir(), 'buildr-verification-diagnostics');
  const artifactDirectory: any = options.artifactDirectory ?? path.join(os.tmpdir(), 'buildr-verification-candidate-package');
  const active: any = new Map();
  let completed: any = 0;
  const heartbeatIntervalMs: any = Number.isFinite(options.heartbeatIntervalMs) && options.heartbeatIntervalMs > 0 ? options.heartbeatIntervalMs : 15_000;
  const concurrency: any = options.concurrency ?? VERIFICATION_CONCURRENCY;
  const preparations: Map<string, Promise<any>> = options.preparations ?? new Map();
  if (!options.packageAdapter && plan.steps.some((step: any) => step.executor?.type === 'candidate-artifact' || step.executor?.consumesArtifact)) {
    const { loadCandidatePackageAdapter } = await import('./package-adapter.ts');
    options = { ...options, packageAdapter: await loadCandidatePackageAdapter() };
  }
  const observeReuse = () => createCandidateRoundExecution(plan, options) ?? createVerificationPlanReuse(plan, options);
  const preflight = options.executorFactory ? null : createVerificationExecutor({ ...options, diagnosticsDirectory, artifactDirectory, preparations });
  const forced = options.reuse?.force === true || (options.env ?? process.env).BUILDR_VERIFICATION_FORCE === '1';
  // A forced run has no reusable checks. Observe once after owned preparation,
  // while retaining the mandatory post-execution content/cleanup validation.
  if (preflight && forced) await preflight.prepareSteps(plan.steps);
  const reuse = preflight && !forced ? await prepareVerificationReuse(plan, preflight.prepareSteps, observeReuse) : observeReuse();
  if (reuse?.explanation) {
    const estimate = reuse.explanation.estimate;
    options.stream?.write(`[${prefix}] plan: execute=${estimate.executedCount} reuse=${estimate.reusedCount} remaining-work=${estimate.remainingWorkMs}ms dependency-path=${estimate.dependencyCriticalPathMs}ms (history/declared targets; queue/preparation excluded)\n`);
    for (const item of reuse.explanation.steps) options.stream?.write(`[${prefix}] ${item.disposition}: ${item.id} reason=${item.reasons.join(',')} scope=${item.inputScope}\n`);
  }
  timings.preparationMs = Date.now() - planStartedAt;
  const contextsStartedAt = Date.now();
  const resourceCoordinator: any = options.resourceCoordinator ?? createVerificationResourceCoordinator({
    root: resolveVerificationCoordinationRoot(options.productRoot, options.env),
    resources: coordinatedResourcesFromLimits(concurrency),
    owner: {
      taskId: options.taskId ?? process.env.BUILDR_TASK_ID ?? 'workspace-verification',
      runId: options.runId ?? `verification-${process.pid}-${Date.now()}`,
    },
  });
  // Provider implementations may load the full Product runtime. Keep them out of
  // the clean-checkout Candidate aggregate import graph until execution starts.
  const requiredContextKeys = plan.steps.filter((step: any) => !reuse?.hits.has(step.id)).flatMap((step: any) => step.contexts ?? []);
  const { TEST_CONTEXT_PROVIDERS }: any = requiredContextKeys.length || options.contextPoolFactory ? await import('../context/registry.ts') : { TEST_CONTEXT_PROVIDERS: [] };
  const contextEnvironment = { ...process.env, ...(options.env ?? {}) };
  delete contextEnvironment.BUILDR_VERIFICATION_FORCE;
  const contextPool: any = (options.contextPoolFactory ?? createTestContextPool)({
    providers: TEST_CONTEXT_PROVIDERS,
    env: contextEnvironment,
  });
  const contextKeys: any[] = [...new Set(plan.steps.filter((step: any) => !reuse?.hits.has(step.id)).flatMap((step: any) => step.contexts ?? []))];
  const preparedContexts: any[] = [];
  const contextFailures = new Map<string, string>();
  for (const key of contextKeys) {
    try { preparedContexts.push(...contextPool.prepareAll([key])); }
    catch (error: any) { contextFailures.set(key, error.message); options.errorStream?.write(`[${prefix}] context unavailable: ${key}: ${error.message}\n`); }
  }
  for (const context of preparedContexts) {
    options.stream?.write(`[${prefix}] context: ${context.provider.key} status=${context.owned ? 'prepared' : 'reused'} prepare=${context.prepareDurationMs}ms identity=${context.marker.identity}\n`);
  }
  timings.contextPreparationMs = Date.now() - contextsStartedAt;
  const executorFactory: any = options.executorFactory ?? createVerificationExecutor;
  const executeFresh: any = executorFactory({
    ...options,
    preparations,
    env: { ...(options.env ?? process.env), ...contextPool.environment(), ...(options.executionProfile?.id ? { BUILDR_VERIFICATION_PROFILE: options.executionProfile.id } : {}) },
    diagnosticsDirectory,
    artifactDirectory,
    onProcessStart(step: any, processIdentity: any): any  {
      const current: any = active.get(step.id);
      if (current) active.set(step.id, { ...current, ...processIdentity });
      options.onProcessStart?.(step, processIdentity);
    },
  });
  let coveredBrowserSteps: Map<string, string> = new Map();
  const execute: any = (step: any, executionContext: any) => {
    if (coveredBrowserSteps.has(step.id)) {
      return Promise.resolve({
        status: 'passed', exitCode: 0, durationMs: 0, stdout: '', stderr: '',
        coveredBy: coveredBrowserSteps.get(step.id),
      });
    }
    const failedContext = (step.contexts ?? []).find((key: string) => contextFailures.has(key));
    if (failedContext) return Promise.resolve({ status: 'blocked', exitCode: 1, durationMs: 0, stdout: '', stderr: '', reason: `Required context ${failedContext} is unavailable: ${contextFailures.get(failedContext)}` });
    const record = reuse?.hits.get(step.id);
    return record ? reusedVerificationResult(record) : reuse ? reuse.executeFiles(step, executeFresh, executionContext) : executeFresh(step, executionContext);
  };
  const heartbeat: any = setInterval(() => {
    const now: any = Date.now();
    const running: any = [...active.entries()].map(([id, item]: any) => `${id}:${now - item.startedAtMs}ms:pid=${item.pid ?? 'pending'}:pgid=${item.processGroupId ?? 'pending'}`);
    options.stream?.write(`[${prefix}] heartbeat completed=${completed}/${plan.steps.length} active=${running.length ? running.join(',') : 'none'}\n`);
  }, heartbeatIntervalMs);
  heartbeat.unref?.();
  const executionStartedAt = Date.now();
  let results: any;
  let contextCleanup: any = null;
  try {
    const baseExecutionPlan = { ...plan, steps: plan.steps.map((step: any) => reuse?.hits.has(step.id)
      ? reusedExecutionStep(step)
      : localExecutionStep(step, options.executionProfile, concurrency)) };
    const bundledExecution = bundleBrowserExecutionSteps(baseExecutionPlan.steps, (id: string) => Boolean(reuse?.hits.has(id)));
    coveredBrowserSteps = bundledExecution.coveredBy;
    const executionPlan = { ...baseExecutionPlan, steps: bundledExecution.steps };
    results = await runVerificationDag(executionPlan, {
      execute,
      concurrency,
      schedulingMode: options.schedulingMode,
      ...(concurrency?.resources?.['browser-runtime']
        ? { priorityResources: options.priorityResources ?? ['browser-runtime'] }
        : {}),
      executionProfile: options.executionProfile,
      resourceCoordinator,
      signal: options.signal,
      onStart: (step: any) => {
        active.set(step.id, { startedAtMs: Date.now(), pid: null, processGroupId: null });
        options.stream?.write(`\n[${prefix}] ${step.id}: ${step.name} concurrency=${step.concurrencyClass}\n`);
        options.onStart?.(step);
      },
      onComplete: (result: any, step: any) => {
        const processIdentity: any = result.process ?? active.get(step.id) ?? {};
        active.delete(step.id);
        completed += 1;
        if (result.stdout) options.stream?.write(result.stdout);
        if (result.stderr) options.errorStream?.write(result.stderr);
        const evidence: any = result.diagnosticDigests
          ? ` evidence=${result.stdoutPath ?? '-'},${result.stderrPath ?? '-'} digest=${result.diagnosticDigests.stdout},${result.diagnosticDigests.stderr}`
          : '';
        const reused = result.reusedFrom ? ` reused=${result.reusedFrom.origin.runId} original=${result.reusedFrom.durationMs}ms` : '';
        options.stream?.write(`[${prefix}] ${result.status}: ${result.id} (${result.durationMs} ms, pid=${processIdentity.pid ?? 'n/a'}, pgid=${processIdentity.processGroupId ?? 'n/a'})${reused}${evidence}\n`);
        if (result.status === 'blocked') options.stream?.write(`  ${result.reason}\n`);
        reuse?.record?.(result);
        options.onComplete?.(result, step);
      },
    });
  } finally {
    timings.executionMs = Date.now() - executionStartedAt;
    clearInterval(heartbeat);
    const cleanupStartedAt = Date.now();
    try {
      contextCleanup = contextPool.cleanup();
    } catch (error) {
      // Only new executions depended on this pool. Reused results retain the
      // successful cleanup and ownership facts from their original run.
      reuse?.invalidate();
      throw error;
    } finally { timings.contextCleanupMs = Date.now() - cleanupStartedAt; }
  }
  // An interrupted child may have left a process touching shared inputs. Keep
  // completed checks only after both child ownership and pool cleanup are known.
  const interruptionClean = !options.signal?.aborted || results.every((result: any) =>
    result.disposition === 'reused' || result.status === 'blocked' || result.processCleanup?.status === 'clean');
  const cleanupClean = contextCleanup?.status === 'cleaned' && interruptionClean;
  const finalizationStartedAt = Date.now();
  const sourceBundle = reuse?.finish(results, cleanupClean);
  timings.reuseFinalizationMs = Date.now() - finalizationStartedAt;
  timings.totalMs = Date.now() - planStartedAt;
  options.stream?.write(`[${prefix}] phases ${JSON.stringify(timings)}\n`);
  return {
    results,
    timings,
    diagnosticsDirectory,
    artifactDirectory,
    ...(sourceBundle ? { sourceBundle } : {}),
    cleanupClean,
    ...(reuse?.explanation ? { reusePlan: reuse.explanation } : {}),
    coordinationRoot: resourceCoordinator.root,
    contextLifecycle: { contexts: preparedContexts.map((context: any) => ({ provider: context.provider.key, identity: context.marker.identity, owned: context.owned, prepareDurationMs: context.prepareDurationMs })), events: contextCleanup?.events ?? contextPool.events() },
    passed: !options.signal?.aborted && results.every((result: any) => result.status === 'passed'),
  };
}
