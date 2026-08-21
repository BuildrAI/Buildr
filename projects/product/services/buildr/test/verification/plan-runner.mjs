import os from 'node:os';
import path from 'node:path';
import { runVerificationDag } from './dag-scheduler.mjs';
import { createVerificationExecutor } from './executor.mjs';
import { coordinatedResourcesFromLimits, createVerificationResourceCoordinator, resolveVerificationCoordinationRoot } from './resource-coordinator.mjs';
import { VERIFICATION_CONCURRENCY } from './registry.mjs';

export const FULL_PLAN_RESOURCE_ID = 'product-full-execution';
export const FULL_PLAN_WAIT_TIMEOUT_MS = 30 * 60_000;

export function printPlan(plan, stream = process.stdout) {
  stream.write(`Verification plan: ${plan.steps.length} step(s)\n`);
  if (plan.paths.length > 0) {
    stream.write('Changed paths:\n');
    for (const item of plan.paths) stream.write(`  ${item}\n`);
  }
  for (const item of plan.delegated ?? []) stream.write(`Delegated: ${item.path} -> ${item.owners.join(', ')}\n`);
  for (const step of plan.steps) {
    stream.write(`\n${step.id} — ${step.name}\n`);
    for (const reason of step.reasons) stream.write(`  selected: ${reason}\n`);
    if (step.dependsOn.length > 0) stream.write(`  depends: ${step.dependsOn.join(', ')}\n`);
  }
}

export async function executePlan(plan, options) {
  const prefix = options.prefix ?? 'verify';
  const diagnosticsDirectory = options.diagnosticsDirectory ?? path.join(os.tmpdir(), 'buildr-verification-diagnostics');
  const artifactDirectory = options.artifactDirectory ?? path.join(os.tmpdir(), 'buildr-verification-candidate-package');
  const active = new Map();
  let completed = 0;
  const heartbeatIntervalMs = Number.isFinite(options.heartbeatIntervalMs) && options.heartbeatIntervalMs > 0 ? options.heartbeatIntervalMs : 15_000;
  const executorFactory = options.executorFactory ?? createVerificationExecutor;
  const execute = executorFactory({
    ...options,
    diagnosticsDirectory,
    artifactDirectory,
    onProcessStart(step, processIdentity) {
      const current = active.get(step.id);
      if (current) active.set(step.id, { ...current, ...processIdentity });
      options.onProcessStart?.(step, processIdentity);
    },
  });
  const concurrency = options.concurrency ?? VERIFICATION_CONCURRENCY;
  const resourceCoordinator = options.resourceCoordinator ?? createVerificationResourceCoordinator({
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
  let fullPlanLease = null;
  if (plan.scope?.mode === 'full') {
    const waitStartedAt = Date.now();
    options.stream?.write(`[${prefix}] waiting: ${FULL_PLAN_RESOURCE_ID} shared capacity\n`);
    const waitHeartbeat = setInterval(() => {
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
  const heartbeat = setInterval(() => {
    const now = Date.now();
    const running = [...active.entries()].map(([id, item]) => `${id}:${now - item.startedAtMs}ms:pid=${item.pid ?? 'pending'}:pgid=${item.processGroupId ?? 'pending'}`);
    options.stream?.write(`[${prefix}] heartbeat completed=${completed}/${plan.steps.length} active=${running.length ? running.join(',') : 'none'}\n`);
  }, heartbeatIntervalMs);
  heartbeat.unref?.();
  let results;
  let fullPlanRelease = [];
  try {
    results = await runVerificationDag(plan, {
      execute,
      concurrency,
      schedulingMode: options.schedulingMode,
      executionProfile: options.executionProfile,
      resourceCoordinator,
      signal: options.signal,
      onStart: (step) => {
        active.set(step.id, { startedAtMs: Date.now(), pid: null, processGroupId: null });
        options.stream?.write(`\n[${prefix}] ${step.id}: ${step.name}\n`);
        options.onStart?.(step);
      },
      onComplete: (result, step) => {
        const processIdentity = result.process ?? active.get(step.id) ?? {};
        active.delete(step.id);
        completed += 1;
        if (result.stdout) options.stream?.write(result.stdout);
        if (result.stderr) options.errorStream?.write(result.stderr);
        const evidence = result.diagnosticDigests
          ? ` evidence=${result.stdoutPath ?? '-'},${result.stderrPath ?? '-'} digest=${result.diagnosticDigests.stdout},${result.diagnosticDigests.stderr}`
          : '';
        options.stream?.write(`[${prefix}] ${result.status}: ${result.id} (${result.durationMs} ms, pid=${processIdentity.pid ?? 'n/a'}, pgid=${processIdentity.processGroupId ?? 'n/a'})${evidence}\n`);
        if (result.status === 'blocked') options.stream?.write(`  ${result.reason}\n`);
        options.onComplete?.(result, step);
      },
    });
  } finally {
    clearInterval(heartbeat);
    if (fullPlanLease) fullPlanRelease = await fullPlanLease.release();
  }
  const releaseFailed = fullPlanRelease.some((item) => item.status !== 'released');
  if (releaseFailed) throw new Error(`Failed to release ${FULL_PLAN_RESOURCE_ID} shared capacity`);
  return {
    results,
    diagnosticsDirectory,
    artifactDirectory,
    coordinationRoot: resourceCoordinator.root,
    fullPlanCoordination: fullPlanLease ? { waitDurationMs: fullPlanLease.waitDurationMs, release: fullPlanRelease } : null,
    passed: results.every((result) => result.status === 'passed'),
  };
}
