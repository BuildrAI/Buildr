import type { WorkbenchPreference, WorkbenchPreferencePutRequest, WorkbenchPreferencesResponse, WorkbenchVisitRequest } from '../../../../build/generated/workbench-dto.ts';
import { createPreferencesRepository, type PreferenceStoreRuntime } from '../persistence/preferences-repository.ts';
import { validateWorkbenchInput, validatePreferenceIdentity, validateResourceHref, workbenchError } from '../domain/workbench.ts';

export type PreferenceDependencies = {
  store: PreferenceStoreRuntime;
  tasks: { inspect(root: string, taskId: string): any };
  workspace: { get(root: string): any; projects(root: string): any };
};
export function createPreferencesApplication(dependencies: PreferenceDependencies) {
  const repository = createPreferencesRepository(dependencies.store);
  function inspectWorkbenchPreferences(root: string): WorkbenchPreferencesResponse {
    const items = repository.list(root).map((preference) => {
      if (!['pinned-task', 'planned-task', 'followed-project'].includes(preference.kind)) return preference;
      try {
        const object = preference.kind === 'followed-project' ? dependencies.workspace.projects(root).projects[preference.key] : dependencies.tasks.inspect(root, preference.key).record;
        return { ...preference, label: object ? String(object.title || object.name) : `不可用 · ${preference.label}` };
      } catch { return { ...preference, label: `暂不可读 · ${preference.label}` }; }
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
