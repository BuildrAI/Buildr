import { verificationSteps } from '../registry.ts';

// Parent acceptance uses 300 seconds as the standard uncontended Core
// optimization target and 360 seconds as the honest execution budget. The
// former 180-second target is retired because it is below the 244-second
// capacity lower bound of the current 52-step Core.
export const CORE_TOTAL_BUDGET_MS: any = 360000;
export const CANDIDATE_TOTAL_BUDGET_MS: any = 600000;

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
