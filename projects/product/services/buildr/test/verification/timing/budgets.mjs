import { verificationSteps } from '../registry.mjs';

// Transitional lane budgets. The Parent verification work keeps 180 seconds as
// the Core optimization target while the current registry remains above it.
export const CORE_TOTAL_BUDGET_MS = 360000;
export const CANDIDATE_TOTAL_BUDGET_MS = 600000;

export const CORE_STEP_BUDGETS_MS = Object.freeze(Object.fromEntries(
  verificationSteps
    .filter((step) => step.profiles.includes('core') && step.budgetMs != null)
    .map((step) => [step.id, step.budgetMs]),
));

export const CANDIDATE_STEP_BUDGETS_MS = Object.freeze(Object.fromEntries(
  verificationSteps
    .filter((step) => step.profiles.includes('candidate') && step.budgetMs != null)
    .map((step) => [step.id, step.budgetMs]),
));

export function candidateStepBudget(id) {
  return CANDIDATE_STEP_BUDGETS_MS[id];
}

export function coreStepBudget(id) {
  return CORE_STEP_BUDGETS_MS[id];
}

export function budgetStatus(durationMs, budgetMs) {
  return durationMs <= budgetMs ? 'within' : 'over';
}
