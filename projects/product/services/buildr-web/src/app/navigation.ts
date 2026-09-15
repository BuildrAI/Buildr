/** Shared route interpretation for top-level areas and contextual navigation. */
export function navigationState(pathname: string, search: string, workspaceId: string | null) {
  const prefix = workspaceId ? `/workspaces/${workspaceId}/` : '/';
  const parts = pathname.startsWith(prefix) ? pathname.slice(prefix.length).split('/') : [];
  const resource = parts[0] || 'tasks';
  const decode = (value: string | undefined) => {
    try { return value ? decodeURIComponent(value) : null; } catch { return null; }
  };
  const projectCode = resource === 'projects' || resource === 'services'
    ? decode(parts[1]) || (resource === 'services' ? new URLSearchParams(search).get('project') : null)
    : null;
  return {
    area: resource === 'tasks' || resource === 'articles' ? 'workbench' as const : 'workspace' as const,
    resource,
    projectCode,
    serviceCode: resource === 'services' ? decode(parts[2]) : null,
  };
}
