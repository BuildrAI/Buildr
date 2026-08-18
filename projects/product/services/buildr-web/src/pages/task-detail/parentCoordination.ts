export type CoordinationDiagnostic = {
  code?: string;
  message?: string;
};

export type ParentContribution = {
  id: string;
  summary: string;
  disposition: string;
  plannedChildTaskId?: string | null;
  deliveredBy?: { taskId: string; kind?: string } | null;
  residual?: { taskId: string; summary: string } | null;
  superseded?: { taskId: string; deliveredByContributionId: string; reason: string } | null;
};

export type ParentDependencyBlocker = {
  contributionId: string;
  dependsOn: string[];
};

export type ParentStartupBlocker = {
  axis: string;
  code: string;
  contributionId?: string;
  dependsOn?: string[];
};

export type ParentStartupNext = {
  mode: 'required' | 'recommended';
  owner: string;
  action: string;
  contributionIds?: string[];
  summary: string;
};

export type ParentPlanningReview = {
  present: boolean;
  applicability?: string | null;
  result?: {
    conclusion?: {
      outcome?: string | null;
      summary?: string | null;
    } | null;
    completedAt?: string | null;
  } | null;
};

export type ParentCoordinationChild = {
  taskId: string;
  title: string;
  status: string;
  plannedContributions: string[];
  deliveryProven: boolean;
  diagnostic?: CoordinationDiagnostic | null;
};

export type ParentCoordinationResult = {
  mode?: 'parent-plan' | 'legacy';
  parentPlan?: {
    identity: string;
    outcome: string;
  } | null;
  parentAcceptance?: {
    summary: string;
    acceptedAt: string;
  } | null;
  planningReview?: ParentPlanningReview | null;
  startup?: {
    status: 'ready' | 'blocked' | 'not-applicable';
    blockers: ParentStartupBlocker[];
    dependencyBlockers?: ParentDependencyBlocker[];
    eligibleContributions: string[];
    next: ParentStartupNext | null;
  } | null;
  contributions?: ParentContribution[];
  children?: ParentCoordinationChild[];
  prerequisitesSatisfied?: boolean;
  blockers?: Array<{ contributionId: string; disposition: string }>;
  diagnostic?: CoordinationDiagnostic | null;
};

export function contributionMap(contributions: ParentContribution[]) {
  return new Map(contributions.map((contribution) => [contribution.id, contribution]));
}

export function completedContributionCount(contributions: ParentContribution[]) {
  return contributions.filter((contribution) => ['delivered', 'superseded'].includes(contribution.disposition)).length;
}

export function contributionDispositionLabel(disposition: string) {
  return ({
    unassigned: '尚未分配',
    planned: '已规划',
    delivered: '已交付',
    residual: '仍有残留',
    superseded: '已替代',
    unproven: '交付未证明',
  } as Record<string, string>)[disposition] || disposition;
}

export function startupBlockerLabel(blocker: ParentStartupBlocker) {
  const labels: Record<string, string> = {
    parent_startup_task_not_active: 'Parent Task 当前不是进行中状态。',
    parent_startup_environment_not_ready: 'Parent Environment 尚未准备完成。',
    parent_startup_development_missing: 'Parent Development 尚未建立。',
    parent_startup_plan_missing: 'Parent Plan 尚未记录。',
    parent_startup_review_changes_required: '当前 Parent Plan 的 Planning Review 要求修改。',
    parent_startup_review_not_current: 'Parent Planning Review 缺失或已过期。',
    parent_startup_review_not_consumed: 'Development 尚未消费当前 Planning Review。',
    parent_startup_contribution_dependency_incomplete: '当前没有依赖已满足的 Contribution。',
  };
  return labels[blocker.code] || blocker.code;
}
