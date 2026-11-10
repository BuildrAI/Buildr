export const VERIFICATION_SCHEDULING_MODES: any = Object.freeze(['critical-path', 'cost', 'declaration']);

export function parseVerificationSchedulingMode(value: any = 'cost'): any  {
  if (!VERIFICATION_SCHEDULING_MODES.includes(value)) throw new Error(`Invalid verification scheduling mode: ${value}`);
  return value;
}

export function createVerificationSchedulingPriorities(plan: any): any  {
  const byId: any = new Map(plan.steps.map((step: any) => [step.id, step]));
  const dependents: any = new Map(plan.steps.map((step: any) => [step.id, []]));
  for (const step of plan.steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (dependents.has(dependency)) dependents.get(dependency).push(step.id);
    }
  }
  const remainingCostById: any = new Map();
  const visiting: any = new Set();
  const remainingCost: any = (id: any) => {
    if (remainingCostById.has(id)) return remainingCostById.get(id);
    if (visiting.has(id)) throw new Error(`Verification scheduling priority cycle: ${id}`);
    visiting.add(id);
    const downstream: any = dependents.get(id) ?? [];
    const value: any = (byId.get(id)?.schedulingCostMs ?? 0)
      + Math.max(0, ...downstream.map((dependent: any) => remainingCost(dependent)));
    visiting.delete(id);
    remainingCostById.set(id, value);
    return value;
  };
  return new Map(plan.steps.map((step: any) => [step.id, Object.freeze({
    stepCostMs: step.schedulingCostMs ?? 0,
    remainingCostMs: remainingCost(step.id),
    directDependentCount: dependents.get(step.id)?.length ?? 0,
  })]));
}
function failedDependency(step: any, results: any): any  {
  return (step.dependsOn ?? []).find((id: any) => results.has(id) && results.get(id).status !== 'passed');
}

function normalizedLimits(requested: any, plan: any): any  {
  if (Number.isInteger(requested)) return { global: requested, classes: { default: requested }, resources: {}, capacities: { workers: requested, processes: requested, git: requested, workspaceIo: requested } };
  if (requested) return { ...requested, capacities: requested.capacities ?? { workers: requested.global, processes: requested.global, git: requested.global, workspaceIo: requested.global } };
  const global: any = Math.max(1, Math.min(4, plan.steps.length));
  const classes: any = Object.fromEntries([...new Set(plan.steps.map((step: any) => step.concurrencyClass || 'default'))].map((id: any) => [id, global]));
  const resources: any = Object.fromEntries([...new Set(plan.steps.flatMap((step: any) => step.resources || []))].map((id: any) => [id, global]));
  return { global, classes, resources, capacities: { workers: global, processes: global, git: global, workspaceIo: global } };
}

function stepDemand(step: any, executionProfile: any): any  {
  const declared: any = step.resourceDemand ?? { workers: 1, processes: 1 };
  const profileWorkers: any = executionProfile?.limits?.innerConcurrency?.[step.id];
  const workers: any = profileWorkers ?? declared.workers ?? 1;
  return Object.freeze({
    ...declared,
    workers,
    processes: profileWorkers == null ? (declared.processes ?? 1) : Math.min(declared.processes ?? workers, workers),
  });
}

export async function runVerificationDag(plan: any, options: any = {}): Promise<any>  {
  const execute: any = options.execute;
  if (typeof execute !== 'function') throw new Error('runVerificationDag requires an execute function');
  const now: any = options.now ?? Date.now;
  const queuedAtMs: any = now();
  const queuedAt: any = new Date(queuedAtMs).toISOString();
  const limits: any = normalizedLimits(options.concurrency, plan);
  if (!Number.isInteger(limits.global) || limits.global < 1) throw new Error('Invalid global concurrency limit');
  for (const [name, value] of Object.entries(limits.classes ?? {})) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error(`Invalid concurrency limit for ${name}`);
  }
  for (const [name, value] of Object.entries(limits.resources ?? {})) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error(`Invalid concurrency limit for resource ${name}`);
  }
  for (const [name, value] of Object.entries(limits.capacities ?? {})) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error(`Invalid resource capacity for ${name}`);
  }
  for (const step of plan.steps) for (const [resource, units] of Object.entries(step.resourceUnits ?? {})) {
    if (!(step.resources ?? []).includes(resource) || typeof units !== 'number' || !Number.isInteger(units) || units < 1) throw new Error(`Invalid resource units for ${step.id}: ${resource}`);
    if (units > (limits.resources?.[resource] ?? 0)) throw new Error(`Unsatisfied resource units for ${step.id}: ${resource}`);
  }
  const schedulingMode: any = parseVerificationSchedulingMode(options.schedulingMode);
  const priorityResourceInput: any = options.priorityResources ?? [];
  if (!Array.isArray(priorityResourceInput) || priorityResourceInput.some((resource: any) => typeof resource !== 'string')) {
    throw new Error('priorityResources must be an array of resource names');
  }
  const priorityResources: string[] = [...new Set<string>(priorityResourceInput)];
  for (const resource of priorityResources) {
    if (!Number.isInteger(limits.resources?.[resource]) || limits.resources[resource] < 1) {
      throw new Error(`Invalid priority resource: ${resource}`);
    }
  }
  const planIndex: any = new Map(plan.steps.map((step: any, index: any) => [step.id, index]));
  const schedulingPriorities: any = createVerificationSchedulingPriorities(plan);
  const pending: any = new Map(plan.steps.map((step: any) => [step.id, step]));
  const active: any = new Map();
  const activeByClass: any = new Map();
  const activeByResource: any = new Map();
  const activeDemand: any = new Map();
  const results: any = new Map();
  const demandByStep: any = new Map(plan.steps.map((step: any) => [step.id, stepDemand(step, options.executionProfile)]));
  for (const step of plan.steps) for (const [dimension, value] of Object.entries(demandByStep.get(step.id))) {
    const capacity: any = limits.capacities?.[dimension];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error(`Invalid ${dimension} resource demand for ${step.id}`);
    if (!Number.isInteger(capacity) || capacity < (value as number)) throw new Error(`Unsatisfied ${dimension} resource demand for ${step.id}: demand=${value} capacity=${capacity ?? 'missing'}`);
  }

  let schedulingEventAtMs = queuedAtMs;
  const waiting = new Map<string, { reasons: string[]; since: number }>();
  const waits = new Map<string, any[]>();
  const observeWait = (step: any, reasons: string[]) => {
    const previous = waiting.get(step.id);
    if (previous && previous.reasons.join('|') === reasons.join('|')) return;
    if (previous) {
      const history = waits.get(step.id) ?? [];
      history.push({ scope: 'local-admission', reasons: previous.reasons,
        startedAt: new Date(previous.since).toISOString(), finishedAt: new Date(schedulingEventAtMs).toISOString(),
        durationMs: Math.max(0, schedulingEventAtMs - previous.since) });
      waits.set(step.id, history);
    }
    if (reasons.length) waiting.set(step.id, { reasons, since: schedulingEventAtMs });
    else waiting.delete(step.id);
  };

  const admissionReasons: any = (step: any) => {
    const reasons: string[] = [];
    if (active.size >= limits.global) reasons.push('global-capacity');
    const concurrencyClass: any = step.concurrencyClass || 'default';
    const classLimit: any = limits.classes[concurrencyClass] ?? limits.global;
    if (!Number.isInteger(classLimit) || classLimit < 1) throw new Error(`Invalid concurrency limit for ${concurrencyClass}`);
    if ((activeByClass.get(concurrencyClass) ?? 0) >= classLimit) reasons.push(`class:${concurrencyClass}`);
    for (const resource of step.resources ?? []) {
      const resourceLimit: any = limits.resources?.[resource];
      if (!Number.isInteger(resourceLimit) || resourceLimit < 1) throw new Error(`Invalid concurrency limit for resource ${resource}`);
      if ((activeByResource.get(resource) ?? 0) + (step.resourceUnits?.[resource] ?? 1) > resourceLimit) reasons.push(`resource:${resource}`);
    }
    for (const [dimension, demand] of Object.entries(demandByStep.get(step.id))) {
      if ((activeDemand.get(dimension) ?? 0) + demand > limits.capacities[dimension]) reasons.push(`capacity:${dimension}`);
    }
    const exclusiveRunning: any = [...active.values()].some((item: any) => (item.step.concurrencyClass || 'default') === 'exclusive');
    if (exclusiveRunning) reasons.push('exclusive-running');
    if (concurrencyClass === 'exclusive' && active.size > 0) reasons.push('exclusive-needs-idle');
    return reasons;
  };

  const launch: any = (step: any) => {
    observeWait(step, []);
    let startedAtMs: any = null;
    const concurrencyClass: any = step.concurrencyClass || 'default';
    const resourceGrant: any = demandByStep.get(step.id);
    pending.delete(step.id);
    activeByClass.set(concurrencyClass, (activeByClass.get(concurrencyClass) ?? 0) + 1);
    for (const resource of step.resources ?? []) activeByResource.set(resource, (activeByResource.get(resource) ?? 0) + (step.resourceUnits?.[resource] ?? 1));
    for (const [dimension, demand] of Object.entries(resourceGrant)) activeDemand.set(dimension, (activeDemand.get(dimension) ?? 0) + demand);
    let resourceHandle: any = null;
    const promise: any = Promise.resolve().then(async () => {
      if (options.signal?.aborted) return { status: 'blocked', exitCode: null, durationMs: 0, reason: 'execution cancelled before start', failureCode: 'capability-cancelled' };
      resourceHandle = options.resourceCoordinator && (step.resourceClaims ?? step.resources ?? []).length > 0
        ? await options.resourceCoordinator.acquire(step.resourceClaims ?? step.resources, { authorizedResources: options.authorizedResources, signal: options.signal })
        : null;
      if (options.signal?.aborted) return { status: 'blocked', exitCode: null, durationMs: 0, reason: 'execution cancelled before start', failureCode: 'capability-cancelled' };
      startedAtMs = now();
      schedulingEventAtMs = Math.max(schedulingEventAtMs, startedAtMs);
      options.onStart?.(step, resourceGrant);
      return execute(step, { resourceEnvironment: resourceHandle?.environment || {}, executionProfile: options.executionProfile, resourceGrant });
    }).then((result: any) => ({ id: step.id, title: step.title, name: step.name, ...result }), (error: any) => ({
      id: step.id, title: step.title, name: step.name, status: 'failed', exitCode: 1, signal: null, durationMs: 0, stdout: '', stderr: `${error.stack || error.message}\n`,
    })).then(async (result: any) => {
      const release: any = resourceHandle ? await resourceHandle.release() : [];
      const releaseFailed: any = release.some((item: any) => !['released', 'not-applicable'].includes(item.status));
      const finishedAtMs: any = now();
      schedulingEventAtMs = Math.max(schedulingEventAtMs, finishedAtMs);
      const scheduledResult: any = {
        ...result,
        scheduling: Object.freeze({ mode: schedulingMode, ...schedulingPriorities.get(step.id), demand: resourceGrant, grant: resourceGrant, ...(waits.has(step.id) ? { waits: waits.get(step.id) } : {}) }),
        ...(resourceHandle ? { resourceCoordination: { waitDurationMs: resourceHandle.waitDurationMs, acquiredAt: resourceHandle.acquiredAt, claims: resourceHandle.claims.map(({ heartbeat, directory, token, ...claim }: any) => claim), release } } : {}),
        ...(releaseFailed && result.status === 'passed' ? { status: 'failed', exitCode: 1, stderr: `${result.stderr || ''}Verification resource cleanup did not preserve ownership.\n` } : {}),
        queuedAt,
        ...(startedAtMs === null ? { [result.status === 'blocked' ? 'blockedAt' : 'finishedAt']: new Date(finishedAtMs).toISOString() } : {
          startedAt: new Date(startedAtMs).toISOString(),
          finishedAt: new Date(finishedAtMs).toISOString(),
          queueDurationMs: startedAtMs - queuedAtMs,
        }),
      };
      active.delete(step.id);
      activeByClass.set(concurrencyClass, activeByClass.get(concurrencyClass) - 1);
      for (const resource of step.resources ?? []) activeByResource.set(resource, activeByResource.get(resource) - (step.resourceUnits?.[resource] ?? 1));
      for (const [dimension, demand] of Object.entries(resourceGrant)) activeDemand.set(dimension, activeDemand.get(dimension) - (demand as number));
      results.set(step.id, scheduledResult);
      options.onComplete?.(scheduledResult, step);
      return scheduledResult;
    });
    active.set(step.id, { step, promise });
  };

  const pendingInSchedulingOrder: any = () => [...pending.values()].sort((left: any, right: any) => {
    // A scarce resource with an idle slot is worth filling before ordinary
    // work. Once every priority slot is occupied, normal ordering applies so
    // unrelated checks keep progressing instead of waiting for a browser turn.
    const freePriorityResources: string[] = priorityResources.filter((resource: string) =>
      (activeByResource.get(resource) ?? 0) < limits.resources[resource]);
    if (freePriorityResources.length > 0) {
      const leftPriority: any = (left.resources ?? []).some((resource: string) => freePriorityResources.includes(resource));
      const rightPriority: any = (right.resources ?? []).some((resource: string) => freePriorityResources.includes(resource));
      if (leftPriority !== rightPriority) return leftPriority ? -1 : 1;
    }
    if (schedulingMode === 'critical-path') {
      const leftPriority: any = schedulingPriorities.get(left.id);
      const rightPriority: any = schedulingPriorities.get(right.id);
      const pathDifference: any = rightPriority.remainingCostMs - leftPriority.remainingCostMs;
      if (pathDifference !== 0) return pathDifference;
      const fanoutDifference: any = rightPriority.directDependentCount - leftPriority.directDependentCount;
      if (fanoutDifference !== 0) return fanoutDifference;
      const costDifference: any = rightPriority.stepCostMs - leftPriority.stepCostMs;
      if (costDifference !== 0) return costDifference;
    }
    if (schedulingMode === 'cost') {
      const costDifference: any = (right.schedulingCostMs ?? 0) - (left.schedulingCostMs ?? 0);
      if (costDifference !== 0) return costDifference;
    }
    return planIndex.get(left.id) - planIndex.get(right.id);
  });

  while (pending.size > 0 || active.size > 0) {
    let progressed: any = false;
    if (options.signal?.aborted) {
      for (const step of pending.values()) {
        schedulingEventAtMs = Math.max(schedulingEventAtMs, now());
        observeWait(step, []);
        const result = { id: step.id, title: step.title, name: step.name, status: 'blocked', exitCode: null, signal: null, durationMs: 0,
          stdout: '', stderr: '', reason: 'execution cancelled before start', failureCode: 'capability-cancelled', queuedAt, blockedAt: new Date(schedulingEventAtMs).toISOString(), ...(waits.has(step.id) ? { scheduling: { mode: schedulingMode, waits: waits.get(step.id) } } : {}) };
        results.set(step.id, result);
        options.onComplete?.(result, step);
      }
      pending.clear();
    }
    for (const step of [...pending.values()]) {
      const blockedBy: any = failedDependency(step, results);
      if (!blockedBy) continue;
      pending.delete(step.id);
      const blockedAtMs: any = now();
      schedulingEventAtMs = Math.max(schedulingEventAtMs, blockedAtMs);
      observeWait(step, []);
      const result: any = { id: step.id, title: step.title, name: step.name, status: 'blocked', exitCode: null, signal: null, durationMs: 0, stdout: '', stderr: '', blockedBy, reason: `dependency ${blockedBy} did not pass`, queuedAt, blockedAt: new Date(blockedAtMs).toISOString(), ...(waits.has(step.id) ? { scheduling: { mode: schedulingMode, waits: waits.get(step.id) } } : {}) };
      results.set(step.id, result);
      options.onComplete?.(result, step);
      progressed = true;
    }
    for (const step of pendingInSchedulingOrder()) {
      const dependencies = (step.dependsOn ?? []).filter((id: string) => results.get(id)?.status !== 'passed');
      const reasons = dependencies.length ? dependencies.map((id: string) => `dependency:${id}`) : admissionReasons(step);
      if (reasons.length) { observeWait(step, reasons); continue; }
      launch(step);
      progressed = true;

    }
    if (active.size > 0) {
      await Promise.race([...active.values()].map((item: any) => item.promise));
      continue;
    }
    if (pending.size > 0 && !progressed) throw new Error(`Verification DAG stalled: ${[...pending.keys()].join(', ')}`);
  }
  return plan.steps.map((step: any) => results.get(step.id));
}
