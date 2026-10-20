import type { WorkbenchPreference, WorkbenchPreferencePutRequest, WorkbenchPreferencesResponse, WorkbenchVisitRequest } from '../../../../build/generated/workbench-dto.ts';
import { createPreferencesRepository, type PreferenceStoreRuntime } from '../persistence/preferences-repository.ts';
import { validateWorkbenchInput, validatePreferenceIdentity, validateResourceHref, workbenchError } from '../domain/workbench.ts';

export type PreferenceDependencies = {
  store: PreferenceStoreRuntime;
  tasks: { inspect(root: string, taskId: string): any; titles(root: string, taskIds: string[]): Map<string, string> };
  workspace: { get(root: string): any; projects(root: string): any };
};
export function createPreferencesApplication(dependencies: PreferenceDependencies) {
  const repository = createPreferencesRepository(dependencies.store);
  function inspectWorkbenchPreferences(root: string): WorkbenchPreferencesResponse {
    const stored = repository.list(root);
    const taskIds = [...new Set(stored.filter(item => item.kind === 'pinned-task' || item.kind === 'planned-task').map(item => item.key))];
    let titles: Map<string, string> | null = new Map();
    try { if (taskIds.length) titles = dependencies.tasks.titles(root, taskIds); } catch { titles = null; }
    let projects: Record<string, { name?: string }> | null = {};
    try { if (stored.some(item => item.kind === 'followed-project')) projects = dependencies.workspace.projects(root).projects; } catch { projects = null; }
    const fallbackTitles = new Map<string, string>();
    const items = stored.map(preference => {
      if (preference.kind === 'followed-project') {
        const project = projects?.[preference.key];
        return { ...preference, label: projects === null ? `暂不可读 · ${preference.label}` : project ? String(project.name) : `不可用 · ${preference.label}` };
      }
      if (preference.kind !== 'pinned-task' && preference.kind !== 'planned-task') return preference;
      if (titles) return { ...preference, label: titles.get(preference.key) || `不可用 · ${preference.label}` };
      // A malformed object must not hide other readable task labels.
      if (!fallbackTitles.has(preference.key)) {
        try { fallbackTitles.set(preference.key, dependencies.tasks.inspect(root, preference.key).record.title); }
        catch { fallbackTitles.set(preference.key, `暂不可读 · ${preference.label}`); }
      }
      return { ...preference, label: fallbackTitles.get(preference.key)! };
    });
    return { schemaVersion: 'buildr.workbench-preferences/v1', items };
  }
  function putWorkbenchPreference(root: string, kind: WorkbenchPreference['kind'], key: string, input: WorkbenchPreferencePutRequest = {}): WorkbenchPreferencesResponse {
    validatePreferenceIdentity(kind, key);
    validateWorkbenchInput('WorkbenchPreferencePutRequest', input);
    const workspace = dependencies.workspace.get(root);
    const workspaceId = workspace.workspace?.id;
    if (!workspaceId) throw workbenchError('workbench_workspace_unavailable', '当前工作空间身份不可用。', 409);
    let label = input.label || '', href = input.href || '';
    if (kind === 'pinned-task' || kind === 'planned-task') {
      const task = dependencies.tasks.inspect(root, key).record;
      if (kind === 'planned-task' && task.status !== 'todo') throw workbenchError('workbench_planned_task_not_todo', '只能将待办任务加入接下来。', 409);
      label = task.title;
      href = `/workspaces/${workspaceId}/tasks/${key}`;
    } else if (kind === 'followed-project') {
      const project = dependencies.workspace.projects(root).projects[key];
      if (!project) throw workbenchError('workbench_project_not_found', '该项目不存在。', 404);
      label = project.name;
      href = `/workspaces/${workspaceId}/projects/${key}`;
    } else if (!label.trim() || !href) throw workbenchError('workbench_resource_invalid', '收藏和最近访问必须包含资源名称与地址。');
    validateResourceHref(href, workspaceId);
    repository.put(root, { kind, key, label: label.trim(), href, updatedAt: new Date().toISOString() });
    return inspectWorkbenchPreferences(root);
  }
  function removeWorkbenchPreference(root: string, kind: string, key: string): WorkbenchPreferencesResponse {
    validatePreferenceIdentity(kind, key);
    repository.remove(root, kind, key);
    return inspectWorkbenchPreferences(root);
  }
  function recordWorkbenchVisit(root: string, input: WorkbenchVisitRequest): WorkbenchPreferencesResponse {
    validateWorkbenchInput('WorkbenchVisitRequest', input);
    return putWorkbenchPreference(root, 'recent-resource', input.key, { label: input.label, href: input.href });
  }
  return Object.freeze({ inspectWorkbenchPreferences, putWorkbenchPreference, removeWorkbenchPreference, recordWorkbenchVisit });
}
export type PreferencesApplication = ReturnType<typeof createPreferencesApplication>;
