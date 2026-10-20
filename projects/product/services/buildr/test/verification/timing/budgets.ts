import { verificationSteps } from '../registry.ts';

// At global capacity 4, the current 49-step Core and 70-step Candidate have 746s and 1071.5s lower bounds.
// Keep both budgets above those floors with room for orchestration and cleanup; these are estimates, not kill switches.
export const CORE_TOTAL_BUDGET_MS: any = 1_250_000;
export const CANDIDATE_TOTAL_BUDGET_MS: any = 1_250_000;

export const CORE_STEP_BUDGETS_MS: any = Object.freeze(Object.fromEntries(
  verificationSteps
    .filter((step: any) => step.profiles.includes('core') && step.budgetMs != null)
    .map((step: any) => [step.id, step.budgetMs]),
));

export const CANDIDATE_STEP_BUDGETS_MS: any = Object.freeze(Object.fromEntries(
  verificationSteps
    .filter((step: any) => step.profiles.includes('candidate') && step.budgetMs != null)
    .map((step: any) => [step.id, step.budgetMs]),
));

export function candidateStepBudget(id: any): any  {
  return CANDIDATE_STEP_BUDGETS_MS[id];
}

export function coreStepBudget(id: any): any  {
  return CORE_STEP_BUDGETS_MS[id];
}

export function budgetStatus(durationMs: any, budgetMs: any): any  {
  return durationMs <= budgetMs ? 'within' : 'over';
}
