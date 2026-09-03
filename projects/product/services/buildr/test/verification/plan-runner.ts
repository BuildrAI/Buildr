import os from 'node:os';
import path from 'node:path';
import { createTestContextPool } from '../context/runtime.ts';
import { runVerificationDag } from './dag-scheduler.ts';
import { createVerificationExecutor } from './executor.ts';
import { coordinatedResourcesFromLimits, createVerificationResourceCoordinator, resolveVerificationCoordinationRoot } from './resource-coordinator.ts';
import { VERIFICATION_CONCURRENCY } from './registry.ts';

export const FULL_PLAN_RESOURCE_ID: any = 'product-full-execution';
export const FULL_PLAN_WAIT_TIMEOUT_MS: any = 30 * 60_000;

export function printPlan(plan: any, stream: any = process.stdout): any  {
  stream.write(`Verification plan: status=${plan.status ?? 'ready'} ${plan.steps.length} step(s)\n`);
  if (plan.paths.length > 0) {
    stream.write('Changed paths:\n');
    for (const item of plan.paths) stream.write(`  ${item}\n`);
  }
  for (const item of plan.delegated ?? []) stream.write(`Delegated: ${item.path} -> ${item.owners.join(', ')}\n`);
  if (plan.estimate) {
    stream.write(`Estimate: work=${plan.estimate.totalTargetDurationMs}ms minimum=${plan.estimate.minimumFeasibleDurationMs}ms budget=${plan.estimate.declaredBudgetMs ?? 'none'} feasible=${plan.estimate.feasible ?? 'not-declared'}\n`);
  }
  if (plan.diagnostic) stream.write(`Blocked: ${plan.diagnostic.code} — ${plan.diagnostic.message}\n`);
  for (const step of plan.steps) {
    stream.write(`\n${step.id} — ${step.name}\n`);
    for (const reason of step.reasons) stream.write(`  selected: ${reason}\n`);
    if (step.dependsOn.length > 0) stream.write(`  depends: ${step.dependsOn.join(', ')}\n`);
  }
}

export async function executePlan(plan: any, options: any): Promise<any>  {
  if (plan.status === 'blocked') throw new Error(plan.diagnostic?.message ?? 'Verification plan is blocked.');
  const prefix: any = options.prefix ?? 'verify';
  const diagnosticsDirectory: any = options.diagnosticsDirectory ?? path.join(os.tmpdir(), 'buildr-verification-diagnostics');
  const artifactDirectory: any = options.artifactDirectory ?? path.join(os.tmpdir(), 'buildr-verification-candidate-package');
  const active: any = new Map();
  let completed: any = 0;
  const heartbeatIntervalMs: any = Number.isFinite(options.heartbeatIntervalMs) && options.heartbeatIntervalMs > 0 ? options.heartbeatIntervalMs : 15_000;
  const concurrency: any = options.concurrency ?? VERIFICATION_CONCURRENCY;
  const resourceCoordinator: any = options.resourceCoordinator ?? createVerificationResourceCoordinator({
    root: resolveVerificationCoordinationRoot(options.productRoot, options.env),
    resources: {
      ...coordinatedResourcesFromLimits(concurrency),
      [FULL_PLAN_RESOURCE_ID]: {
        id: FULL_PLAN_RESOURCE_ID,
        strategy: 'coordinated',
        capacity: 1,
        authorization: 'implicit',
      },
    },
    owner: {
      taskId: options.taskId ?? process.env.BUILDR_TASK_ID ?? 'workspace-verification',
      runId: options.runId ?? `verification-${process.pid}-${Date.now()}`,
    },
  });
  let fullPlanLease: any = null;
  if (plan.scope?.mode === 'full') {
    const waitStartedAt: any = Date.now();
    options.stream?.write(`[${prefix}] waiting: ${FULL_PLAN_RESOURCE_ID} shared capacity\n`);
    const waitHeartbeat: any = setInterval(() => {
      options.stream?.write(`[${prefix}] waiting: ${FULL_PLAN_RESOURCE_ID} elapsed=${Date.now() - waitStartedAt}ms\n`);
    }, 15_000);
    waitHeartbeat.unref?.();
    try {
      fullPlanLease = await resourceCoordinator.acquire([FULL_PLAN_RESOURCE_ID], {
        signal: options.signal,
        waitTimeoutMs: FULL_PLAN_WAIT_TIMEOUT_MS,
      });
    } finally {
      clearInterval(waitHeartbeat);
    }
    options.stream?.write(`[${prefix}] acquired: ${FULL_PLAN_RESOURCE_ID} wait=${fullPlanLease.waitDurationMs}ms\n`);
  }
  // Provider implementations may load the full Product runtime. Keep them out of
  // the clean-checkout Candidate aggregate import graph until execution starts.
  const { TEST_CONTEXT_PROVIDERS }: any = await import('../context/registry.ts');
  const contextPool: any = createTestContextPool({
    providers: TEST_CONTEXT_PROVIDERS,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  const contextKeys: any[] = [...new Set(plan.steps.flatMap((step: any) => step.contexts ?? []))];
  let preparedContexts: any;
  try {
    preparedContexts = contextPool.prepareAll(contextKeys);
  } catch (error: any) {
    contextPool.cleanup();
    if (fullPlanLease) await fullPlanLease.release();
    throw error;
  }
  for (const context of preparedContexts) {
    options.stream?.write(`[${prefix}] context: ${context.provider.key} status=${context.owned ? 'prepared' : 'reused'} prepare=${context.prepareDurationMs}ms identity=${context.marker.identity}\n`);
  }
  const executorFactory: any = options.executorFactory ?? createVerificationExecutor;
  const execute: any = executorFactory({
    ...options,
    env: { ...(options.env ?? process.env), ...contextPool.environment() },
    diagnosticsDirectory,
    artifactDirectory,
    onProcessStart(step: any, processIdentity: any): any  {
      const current: any = active.get(step.id);
      if (current) active.set(step.id, { ...current, ...processIdentity });
      options.onProcessStart?.(step, processIdentity);
    },
  });
  const heartbeat: any = setInterval(() => {
    const now: any = Date.now();
    const running: any = [...active.entries()].map(([id, item]: any) => `${id}:${now - item.startedAtMs}ms:pid=${item.pid ?? 'pending'}:pgid=${item.processGroupId ?? 'pending'}`);
    options.stream?.write(`[${prefix}] heartbeat completed=${completed}/${plan.steps.length} active=${running.length ? running.join(',') : 'none'}\n`);
  }, heartbeatIntervalMs);
  heartbeat.unref?.();
  let results: any;
  let fullPlanRelease: any[] = [];
  let contextCleanup: any = null;
  try {
    results = await runVerificationDag(plan, {
      execute,
      concurrency,
      schedulingMode: options.schedulingMode,
      executionProfile: options.executionProfile,
      resourceCoordinator,
      signal: options.signal,
      onStart: (step: any) => {
        active.set(step.id, { startedAtMs: Date.now(), pid: null, processGroupId: null });
        options.stream?.write(`\n[${prefix}] ${step.id}: ${step.name}\n`);
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
        options.stream?.write(`[${prefix}] ${result.status}: ${result.id} (${result.durationMs} ms, pid=${processIdentity.pid ?? 'n/a'}, pgid=${processIdentity.processGroupId ?? 'n/a'})${evidence}\n`);
        if (result.status === 'blocked') options.stream?.write(`  ${result.reason}\n`);
        options.onComplete?.(result, step);
      },
    });
  } finally {
    clearInterval(heartbeat);
    try {
      contextCleanup = contextPool.cleanup();
    } finally {
      if (fullPlanLease) fullPlanRelease = await fullPlanLease.release();
    }
  }
  const releaseFailed: any = fullPlanRelease.some((item: any) => item.status !== 'released');
  if (releaseFailed) throw new Error(`Failed to release ${FULL_PLAN_RESOURCE_ID} shared capacity`);
  return {
    results,
    diagnosticsDirectory,
    artifactDirectory,
    coordinationRoot: resourceCoordinator.root,
    fullPlanCoordination: fullPlanLease ? { waitDurationMs: fullPlanLease.waitDurationMs, release: fullPlanRelease } : null,
    contextLifecycle: { contexts: preparedContexts.map((context: any) => ({ provider: context.provider.key, identity: context.marker.identity, owned: context.owned, prepareDurationMs: context.prepareDurationMs })), events: contextCleanup?.events ?? contextPool.events() },
    passed: results.every((result: any) => result.status === 'passed'),
  };
}
