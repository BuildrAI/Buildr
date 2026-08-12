export const VERIFICATION_WORKER_BUDGET_ENV = 'BUILDR_VERIFICATION_WORKER_BUDGET';

export function resolveVerificationWorkerBudget({ env = process.env, fallback, maximum, label }) {
  if (!Number.isInteger(fallback) || fallback < 1) throw new Error(`${label} fallback worker budget must be a positive integer`);
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error(`${label} maximum worker budget must be a positive integer`);
  const configured = env[VERIFICATION_WORKER_BUDGET_ENV];
  if (configured == null || configured === '') return Math.min(fallback, maximum);
  if (!/^[1-9]\d*$/.test(configured)) throw new Error(`${label} worker budget must be a positive integer`);
  const budget = Number(configured);
  if (!Number.isSafeInteger(budget) || budget > maximum) throw new Error(`${label} worker budget must not exceed ${maximum}`);
  return budget;
}
