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

export function capabilityOutcomeLabel(outcome?: string): string {
  return ({ passed: '已通过', failed: '失败', blocked: '受阻', skipped: '已跳过' } as Record<string, string>)[outcome || ''] || outcome || '未知';
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
