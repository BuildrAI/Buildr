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
  const initial = Math.max(1, Math.min(4, Math.floor(machine.parallelism / 3), Math.floor(memoryGiB / 4)));
  const width = configured === undefined ? initial : Number(configured);
  const workers = automatic ? Math.max(4, Math.min(16, machine.parallelism, Math.floor(memoryGiB))) : base.capacities.workers;
  return {
    limits: {
      ...base,
      global: width,
      classes: { ...base.classes, default: width, 'workspace-heavy': width, 'cpu-heavy': Math.min(2, width), network: Math.min(2, width) },
      resources: { ...base.resources, 'browser-runtime': Math.max(2, width) },
      capacities: { ...base.capacities, workers: Math.max(workers, 2 * width), processes: Math.max(workers, 2 * width), workspaceIo: Math.max(2, width) },
    },
    capacityPolicy: configured === undefined ? 'machine-initial' : 'explicit-jobs',
    capacityObservation: { ...machine, initialWidth: initial, ...(configured === undefined ? {} : { requestedJobs: width }) },
  };
}
