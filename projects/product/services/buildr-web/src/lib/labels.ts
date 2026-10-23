export function workspaceHref(workspaceId: string | null, path: string): string {
  if (!workspaceId) return path.startsWith('/') ? path : `/${path}`;
  if (path.startsWith('/workspaces/')) return path;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `/workspaces/${workspaceId}${suffix}`;
}

export function workspaceHomePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/overview`;
}

export function sourceTypeLabel(type: string): string {
  if (type === 'git') return 'Git 仓库';
  if (type === 'workspace') return '当前工作空间';
  return '本地路径';
}

export function projectListSourceLabel(type: string): string {
  if (type === 'git') return 'Git 仓库';
  if (type === 'workspace') return '当前工作空间';
  return type;
}

export const SERVICE_TYPE_OPTIONS = [
  { value: 'backend', label: '后端' },
  { value: 'frontend', label: '前端' },
] as const;

export function serviceTypeLabel(type: string): string {
  return SERVICE_TYPE_OPTIONS.find((option) => option.value === type)?.label || type;
}

/** 只有前端/后端参与界面呈现；其他既有登记值不显示类型标签。 */
export function serviceTypeTagLabel(type: string | undefined): string | null {
  return type === 'frontend' ? '前端' : type === 'backend' ? '后端' : null;
}
