export const VERIFICATION_SCHEDULING_MODES = Object.freeze(['cost', 'declaration']);

export function parseVerificationSchedulingMode(value = 'cost') {
  if (!VERIFICATION_SCHEDULING_MODES.includes(value)) throw new Error(`Invalid verification scheduling mode: ${value}`);
  return value;
}

function failedDependency(step, results) {
  return (step.dependsOn ?? []).find((id) => results.has(id) && results.get(id).status !== 'passed');
}

function dependenciesPassed(step, results) {
  return (step.dependsOn ?? []).every((id) => results.get(id)?.status === 'passed');
}

function normalizedLimits(requested, plan) {
  if (Number.isInteger(requested)) return { global: requested, classes: { default: requested }, resources: {} };
  if (requested) return requested;
  const global = Math.max(1, Math.min(4, plan.steps.length));
  const classes = Object.fromEntries([...new Set(plan.steps.map((step) => step.concurrencyClass || 'default'))].map((id) => [id, global]));
  const resources = Object.fromEntries([...new Set(plan.steps.flatMap((step) => step.resources || []))].map((id) => [id, global]));
  return { global, classes, resources };
}

export async function runVerificationDag(plan, options = {}) {
  const execute = options.execute;
  if (typeof execute !== 'function') throw new Error('runVerificationDag requires an execute function');
  const now = options.now ?? Date.now;
  const queuedAtMs = now();
  const queuedAt = new Date(queuedAtMs).toISOString();
  const limits = normalizedLimits(options.concurrency, plan);
  if (!Number.isInteger(limits.global) || limits.global < 1) throw new Error('Invalid global concurrency limit');
  for (const [name, value] of Object.entries(limits.classes ?? {})) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid concurrency limit for ${name}`);
  }
  for (const [name, value] of Object.entries(limits.resources ?? {})) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid concurrency limit for resource ${name}`);
  }
  const schedulingMode = parseVerificationSchedulingMode(options.schedulingMode);
  const planIndex = new Map(plan.steps.map((step, index) => [step.id, index]));
  const pending = new Map(plan.steps.map((step) => [step.id, step]));
  const active = new Map();
  const activeByClass = new Map();
  const activeByResource = new Map();
  const results = new Map();

  const capacityAvailable = (step) => {
    if (active.size >= limits.global) return false;
    const concurrencyClass = step.concurrencyClass || 'default';
    const classLimit = limits.classes[concurrencyClass] ?? limits.global;
    if (!Number.isInteger(classLimit) || classLimit < 1) throw new Error(`Invalid concurrency limit for ${concurrencyClass}`);
    if ((activeByClass.get(concurrencyClass) ?? 0) >= classLimit) return false;
    for (const resource of step.resources ?? []) {
      const resourceLimit = limits.resources?.[resource];
      if (!Number.isInteger(resourceLimit) || resourceLimit < 1) throw new Error(`Invalid concurrency limit for resource ${resource}`);
      if ((activeByResource.get(resource) ?? 0) >= resourceLimit) return false;
    }
    const exclusiveRunning = [...active.values()].some((item) => (item.step.concurrencyClass || 'default') === 'exclusive');
    if (exclusiveRunning) return false;
    if (concurrencyClass === 'exclusive' && active.size > 0) return false;
    return true;
  };

  const launch = (step) => {
    let startedAtMs = null;
    const concurrencyClass = step.concurrencyClass || 'default';
    pending.delete(step.id);
    activeByClass.set(concurrencyClass, (activeByClass.get(concurrencyClass) ?? 0) + 1);
    for (const resource of step.resources ?? []) activeByResource.set(resource, (activeByResource.get(resource) ?? 0) + 1);
    let resourceHandle = null;
    const promise = Promise.resolve().then(async () => {
      resourceHandle = options.resourceCoordinator && (step.resourceClaims ?? step.resources ?? []).length > 0
        ? await options.resourceCoordinator.acquire(step.resourceClaims ?? step.resources, { authorizedResources: options.authorizedResources, signal: options.signal })
        : null;
      startedAtMs = now();
      options.onStart?.(step);
      return execute(step, { resourceEnvironment: resourceHandle?.environment || {} });
    }).then((result) => ({ id: step.id, title: step.title, name: step.name, ...result }), (error) => ({
      id: step.id, title: step.title, name: step.name, status: 'failed', exitCode: 1, signal: null, durationMs: 0, stdout: '', stderr: `${error.stack || error.message}\n`,
    })).then(async (result) => {
      startedAtMs ??= now();
      const release = resourceHandle ? await resourceHandle.release() : [];
      const releaseFailed = release.some((item) => !['released', 'not-applicable'].includes(item.status));
      const finishedAtMs = now();
      const scheduledResult = {
        ...result,
        ...(resourceHandle ? { resourceCoordination: { waitDurationMs: resourceHandle.waitDurationMs, acquiredAt: resourceHandle.acquiredAt, claims: resourceHandle.claims.map(({ heartbeat, directory, token, ...claim }) => claim), release } } : {}),
        ...(releaseFailed && result.status === 'passed' ? { status: 'failed', exitCode: 1, stderr: `${result.stderr || ''}Verification resource cleanup did not preserve ownership.\n` } : {}),
        queuedAt,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date(finishedAtMs).toISOString(),
        queueDurationMs: startedAtMs - queuedAtMs,
      };
      active.delete(step.id);
      activeByClass.set(concurrencyClass, activeByClass.get(concurrencyClass) - 1);
      for (const resource of step.resources ?? []) activeByResource.set(resource, activeByResource.get(resource) - 1);
      results.set(step.id, scheduledResult);
      options.onComplete?.(scheduledResult, step);
      return scheduledResult;
    });
    active.set(step.id, { step, promise });
  };

  const pendingInSchedulingOrder = () => [...pending.values()].sort((left, right) => {
    if (schedulingMode === 'cost') {
      const costDifference = (right.schedulingCostMs ?? 0) - (left.schedulingCostMs ?? 0);
      if (costDifference !== 0) return costDifference;
    }
    return planIndex.get(left.id) - planIndex.get(right.id);
  });

  while (pending.size > 0 || active.size > 0) {
    let progressed = false;
    for (const step of [...pending.values()]) {
      const blockedBy = failedDependency(step, results);
      if (!blockedBy) continue;
      pending.delete(step.id);
      const blockedAtMs = now();
      const result = { id: step.id, title: step.title, name: step.name, status: 'blocked', exitCode: null, signal: null, durationMs: 0, stdout: '', stderr: '', blockedBy, reason: `dependency ${blockedBy} did not pass`, queuedAt, blockedAt: new Date(blockedAtMs).toISOString() };
      results.set(step.id, result);
      options.onComplete?.(result, step);
      progressed = true;
    }
    for (const step of pendingInSchedulingOrder()) {
      if (!dependenciesPassed(step, results) || !capacityAvailable(step)) continue;
      launch(step);
      progressed = true;
      if ((step.concurrencyClass || 'default') === 'exclusive') break;
    }
    if (active.size > 0) {
      await Promise.race([...active.values()].map((item) => item.promise));
      continue;
    }
    if (pending.size > 0 && !progressed) throw new Error(`Verification DAG stalled: ${[...pending.keys()].join(', ')}`);
  }
  return plan.steps.map((step) => results.get(step.id));
}
