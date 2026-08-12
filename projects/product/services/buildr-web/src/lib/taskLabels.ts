export function taskStatusLabel(status: string): string {
  return status === 'todo' ? '待办' : status === 'active' ? '进行中' : status === 'completed' ? '已完成' : status === 'abandoned' ? '已放弃' : status;
}

export function environmentStatusLabel(status: string): string {
  return ({ ready: '可执行', blocked: '受阻', unavailable: '当前机器不可用', cleaned: '已清理' } as Record<string, string>)[status] || status || '未知';
}

export function probeStatusLabel(status: string): string {
  return ({ ready: '就绪', blocked: '受阻', 'not-applicable': '不适用' } as Record<string, string>)[status] || status || '未知';
}

export function applicabilityLabel(status: string): string {
  return ({ current: '当前适用', stale: '已失效', unknown: '适用性未知' } as Record<string, string>)[status] || status || '未知';
}

export function developmentStatusLabel(status: string): string {
  return ({
    delivered: '已交付',
    'completed-no-change': '已完成，无需交付变更',
    'completed-unproven': '已完成，但交付未经证明',
    abandoned: '已放弃',
    unavailable: '交付事实不可安全核验',
    missing: '尚未形成研发回执',
    planning: '规划中',
    developing: '研发中',
    'candidate-current': '候选已就绪',
    'handoff-current': '研发交接已就绪',
    unknown: '当前无法判断',
  } as Record<string, string>)[status] || '当前无法判断';
}

export function developmentAxisLabel(status: string): string {
  return ({
    current: '当前有效',
    stale: '已失效',
    missing: '尚未形成',
    unknown: '当前无法判断',
    snapshot: '交付时快照',
    historical: '历史快照',
  } as Record<string, string>)[status] || '当前无法判断';
}

export function gateOutcomeLabel(outcome?: string): string {
  return ({ ready: '已就绪', 'changes-required': '需要修改', passed: '已通过', 'not-passed': '未通过' } as Record<string, string>)[outcome || ''] || '尚未形成';
}

export function developmentDispositionLabel(disposition?: string): string {
  return ({ pending: '待形成', current: '当前事实', stale: '已失效', 'not-applicable': '不适用', waived: '已明确豁免' } as Record<string, string>)[disposition || ''] || disposition || '未知';
}

export function decisionOutcomeLabel(outcome?: string): string {
  return ({ proceed: '允许推进', blocked: '阻止推进' } as Record<string, string>)[outcome || ''] || '尚未形成';
}

export function capabilityOutcomeLabel(outcome?: string): string {
  return ({ passed: '已通过', failed: '失败', blocked: '受阻', skipped: '已跳过' } as Record<string, string>)[outcome || ''] || outcome || '未知';
}

export function developmentReasonLabel(reason: { code?: string; message?: string }): string {
  const labels: Record<string, string> = {
    'task-context-changed': '任务上下文已变化。',
    'content-target-changed': '内容目标已变化。',
    'declarations-changed': '验证能力声明已变化。',
    'policy-missing': '尚未形成验证策略。',
    'planning-changes-required': '方案审查要求修改。',
    'planning-missing-or-stale': '方案审查缺失或已失效。',
    'verification-missing-or-stale': '任务验证缺失或已失效。',
    'verification-not-passed': '任务验证尚未通过。',
    'required-facts-incomplete': '验证策略要求的事实尚不完整。',
    'candidate-stale': '当前候选已失效。',
    'completion-missing-or-stale': '完成审查缺失或已失效。',
    'completion-changes-required': '完成审查要求修改。',
  };
  return reason.message || labels[reason.code || ''] || `当前状态原因：${reason.code || '未知'}。`;
}

export function reviewMethodLabel(method: string): string {
  return ({ self: '自审', 'independent-agent': '独立智能体（Agent）', human: '人工' } as Record<string, string>)[method] || method;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN');
}

export function formatShortDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}
