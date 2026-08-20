export type CoordinationDiagnostic = {
  code?: string;
  message?: string;
};

export type ParentContribution = {
  id: string;
  priority: string;
  title: string;
  objective: string;
  directions: string[];
  boundaries: string[];
  dependencies: string[];
  expectation: { status: 'expected' | 'none'; child: string | null };
  eligibility: { status: 'eligible' | 'waiting-dependency' | 'not-eligible'; blockers: Array<{ contributionId: string; title: string }> };
  actual: { status: string };
  actualChild: { taskId: string; title: string; status: string } | null;
  deliveredBy?: { taskId: string; kind?: string } | null;
  residual?: { taskId: string; summary: string } | null;
  superseded?: { taskId: string; deliveredByContributionId: string; reason: string } | null;
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
  resultDigest?: string | null;
  outcome?: string | null;
  summary?: string | null;
  completedAt?: string | null;
};

export type ParentContributionDelivery = {
  handoffIdentity: string;
  delivered: string[];
  extra: string[];
  residual: string[];
  superseded: Array<{ contributionId: string; deliveredByContributionId: string }>;
  affected: string[];
  nextAction: string;
};

export type ParentCoordinationChild = {
  taskId: string;
  title: string;
  status: string;
  boundContributions: string[];
  deliveryProven: boolean;
  delivery?: ParentContributionDelivery | null;
  diagnostic?: CoordinationDiagnostic | null;
};

export type ParentCoordinationResult = {
  mode?: 'parent-plan' | 'child' | 'ordinary' | 'legacy';
  plan?: {
    sourceSchemaVersion: string;
    identity: string;
    outcome: string;
    architectureDecisions: string[];
    finalAcceptance: string[];
  } | null;
  parentSource?: {
    taskId: string;
    title?: string;
    status?: string;
    boundContributions?: string[];
    contributions?: Array<{ id: string; priority: string; title: string; objective: string; directions: string[]; boundaries: string[]; bindingStatus: string }>;
  } | null;
  parentAcceptance?: {
    summary: string;
    acceptedAt: string;
  } | null;
  planningReview?: ParentPlanningReview | null;
  startup?: {
    status: 'ready' | 'blocked' | 'not-applicable';
    blockers: ParentStartupBlocker[];
    eligibleContributions: string[];
    next: ParentStartupNext | null;
  } | null;
  contributions?: ParentContribution[];
  children?: ParentCoordinationChild[];
  prerequisitesSatisfied?: boolean;
  blockers?: Array<{ contributionId: string; actualStatus: string; eligibilityStatus: string }>;
  diagnostic?: CoordinationDiagnostic | null;
};

export type ParentContributionProgressGroupId = 'active-delivered' | 'startable' | 'waiting';

export type ParentContributionProgressItem = {
  contribution: ParentContribution;
  children: ParentCoordinationChild[];
  groupId: ParentContributionProgressGroupId;
  deliveryProven: boolean;
};

export type ParentContributionProgressGroup = {
  id: ParentContributionProgressGroupId;
  label: string;
  items: ParentContributionProgressItem[];
};

const progressGroupLabels: Record<ParentContributionProgressGroupId, string> = {
  'active-delivered': '进行中 / 已交付',
  startable: '可启动',
  waiting: '等待依赖',
};

export function buildContributionProgressGroups(
  contributions: ParentContribution[],
  children: ParentCoordinationChild[],
): ParentContributionProgressGroup[] {
  const items = contributions.map((contribution): ParentContributionProgressItem => {
    const boundChildren = children.filter((child) => child.boundContributions.includes(contribution.id));
    const hasActualWork = boundChildren.length > 0 || contribution.actual.status !== 'unassigned';
    const groupId: ParentContributionProgressGroupId = hasActualWork
      ? 'active-delivered'
      : contribution.eligibility.status === 'eligible'
        ? 'startable'
        : 'waiting';
    return {
      contribution,
      children: boundChildren,
      groupId,
      deliveryProven: boundChildren.some((child) => Boolean(child.deliveryProven && child.delivery)),
    };
  });
  return (['active-delivered', 'startable', 'waiting'] as const).map((id) => ({
    id,
    label: progressGroupLabels[id],
    items: items.filter((item) => item.groupId === id),
  }));
}

export function contributionMap(contributions: ParentContribution[]) {
  return new Map(contributions.map((contribution) => [contribution.id, contribution]));
}

export function completedContributionCount(contributions: ParentContribution[]) {
  return contributions.filter((contribution) => ['delivered', 'superseded'].includes(contribution.actual.status)).length;
}

export function contributionDispositionLabel(disposition: string) {
  return ({
    unassigned: '尚未分配',
    bound: '已绑定',
    active: '进行中',
    delivered: '已交付',
    residual: '仍有残留',
    superseded: '已替代',
    unproven: '交付未证明',
  } as Record<string, string>)[disposition] || '未知状态';
}

export function contributionEligibilityLabel(status: ParentContribution['eligibility']['status']) {
  return ({ eligible: '可启动', 'waiting-dependency': '等待依赖', 'not-eligible': '已有实际承担' } as const)[status];
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
  return labels[blocker.code] || '存在尚未解除的启动阻塞。';
}
