import os from 'node:os';

/** Initial admission policy, not a claim about live CPU/disk saturation. */
export function observeVerificationMachine() {
  const total = os.totalmem();
  const constrained = process.constrainedMemory?.() ?? 0;
  return { parallelism: os.availableParallelism(), memoryBytes: constrained > 0 ? Math.min(total, constrained) : total };
}

export function resolveExecutionCapacity(base: any, { automatic = false, env = process.env, machine = observeVerificationMachine() }: any = {}) {
  const configured = env.BUILDR_VERIFICATION_JOBS;
  if (configured !== undefined && (!/^[1-9]\d*$/.test(configured) || !Number.isSafeInteger(Number(configured) * 2))) {
    throw new Error('BUILDR_VERIFICATION_JOBS must be a safe positive integer');
  }
  if (!automatic && configured === undefined) return { limits: base, capacityPolicy: 'fixed' };
  if (!Number.isInteger(machine.parallelism) || machine.parallelism < 1 || !Number.isFinite(machine.memoryBytes) || machine.memoryBytes <= 0) throw new Error('Invalid verification machine observation');
  const memoryGiB = machine.memoryBytes / 1024 ** 3;
  // Four outer groups were observed to starve real browser, native-agent and
  // handoff checks on a 15-CPU machine (load 12-21). Three is the stable
  // machine-initial width; explicit larger widths remain possible but carry
  // the observed contention risk.
  const initial = Math.max(1, Math.min(3, Math.floor(machine.parallelism / 3), Math.floor(memoryGiB / 4)));
  const width = configured === undefined ? initial : Number(configured);
  // Four simultaneous workspace-heavy groups were observed to starve real
  // browser and process-handoff checks on this machine. Keep the global width
  // for lighter work and two-slot I/O overlap, but admit at most three heavy
  // groups at once.
  const workspaceHeavy = Math.min(3, width);
  // Keep two bounded heavy-I/O groups possible once three outer groups are
  // admitted; lower-width machines retain their smaller I/O capacity.
  const workspaceIo = width >= 3 ? Math.max(4, width) : width;
  // The conversation journey already owns both browser slots. Letting another
  // browser journey overlap starved its setup/models waits; keep the proven
  // two-slot browser boundary even when heavier sibling checks run.
  const browserRuntime = 2;
  const workers = automatic ? Math.max(4, Math.min(16, machine.parallelism, Math.floor(memoryGiB))) : base.capacities.workers;
  return {
    limits: {
      ...base,
      global: width,
      classes: { ...base.classes, default: width, 'workspace-heavy': workspaceHeavy, 'cpu-heavy': Math.min(2, width), network: Math.min(2, width) },
      resources: { ...base.resources, 'browser-runtime': browserRuntime },
      capacities: { ...base.capacities, workers: Math.max(workers, 2 * width), processes: Math.max(workers, 2 * width), workspaceIo },
    },
    capacityPolicy: configured === undefined ? 'machine-initial' : 'explicit-jobs',
    capacityObservation: { ...machine, initialWidth: initial, workspaceHeavyLimit: workspaceHeavy,
      ...(configured === undefined ? {} : { requestedJobs: width }) },
  };
}
