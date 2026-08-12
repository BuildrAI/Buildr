export function workspaceHref(workspaceId: string | null, path: string): string {
  if (!workspaceId) return path.startsWith('/') ? path : `/${path}`;
  if (path.startsWith('/workspaces/')) return path;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `/workspaces/${workspaceId}${suffix}`;
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

export function serviceTypeLabel(type: string): string {
  return ({
    backend: '后端',
    frontend: '前端',
    application: '应用',
    library: '库',
    tool: '工具',
  } as Record<string, string>)[type] || type;
}
