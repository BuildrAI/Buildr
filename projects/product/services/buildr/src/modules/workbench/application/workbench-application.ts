import type { WorkbenchResponse, WorkbenchTaskItem, WorkbenchTaskSection, WorkbenchQuery, WorkbenchDiagnostic } from '../../../../build/generated/workbench-dto.ts';
import type { TaskWorkContextApplication } from '../../task/module.ts';
import type { PreferencesApplication } from './preferences-application.ts';
import { validateWorkbenchInput } from '../domain/workbench.ts';

export type WorkbenchDependencies = {
  preferences: Pick<PreferencesApplication, 'inspectWorkbenchPreferences'>;
  workContext: Pick<TaskWorkContextApplication, 'inspectTaskWorkContext' | 'queryPendingTaskWorkContexts'>;
  tasks: { list(root: string, query: any): any; inspect(root: string, taskId: string): any };
  projects(root: string): any;
};
const LIMIT = 12;
const diagnostic = (failure: unknown): WorkbenchDiagnostic => ({ code: failure && typeof failure === 'object' && 'code' in failure ? String(failure.code) : 'workbench_source_failed', message: failure instanceof Error ? failure.message : String(failure) });
const section = (items: WorkbenchTaskItem[], total = items.length): WorkbenchTaskSection => ({ items: items.slice(0, LIMIT), total, hasMore: total > LIMIT, diagnostic: null });
export function createWorkbenchApplication(dependencies: WorkbenchDependencies) {
  function inspectWorkbench(root: string, input: WorkbenchQuery = {}): WorkbenchResponse {
    validateWorkbenchInput('WorkbenchQuery', input);
    const preferences = dependencies.preferences.inspectWorkbenchPreferences(root);
    const projects = Object.values<any>(dependencies.projects(root).projects).map((project) => ({ code: project.code, name: project.name }));
    if (input.project && !projects.some((project) => project.code === input.project)) throw Object.assign(new Error('所选项目不存在。'), { code: 'workbench_project_not_found', status: 404 });
    const cache = new Map<string, WorkbenchTaskItem>();
    const item = (taskId: string, supplied?: any): WorkbenchTaskItem => {
      const previous = cache.get(taskId);
      if (previous) return previous;
      const view = supplied || dependencies.tasks.inspect(root, taskId);
      const task = { record: view.record, recordDigest: view.recordDigest, taskRelations: view.taskRelations, retrospectiveDocument: view.retrospectiveDocument, referenceDiagnostics: view.referenceDiagnostics };
      const value = { task, workContext: dependencies.workContext.inspectTaskWorkContext(root, taskId) };
      cache.set(taskId, value);
      return value;
    };
    const scoped = (entry: WorkbenchTaskItem) => !input.project || entry.task.record.scope.projects.includes(input.project);
    const readSection = (action: () => WorkbenchTaskSection): WorkbenchTaskSection => { try { return action(); } catch (failure) { return { ...section([]), diagnostic: diagnostic(failure) }; } };
    const attention = readSection(() => { const found = dependencies.workContext.queryPendingTaskWorkContexts(root, input.project, LIMIT); return section(found.taskIds.map((id) => item(id)), found.total); });
    const preferenceTasks = (kind: string, status?: string) => preferences.items.filter((preference) => preference.kind === kind).flatMap((preference) => {
      try { const value = item(preference.key); return scoped(value) && (!status || value.task.record.status === status) ? [value] : []; }
      catch (failure) { if (failure && typeof failure === 'object' && 'status' in failure && failure.status === 404) return []; throw failure; }
    });
    const active = readSection(() => {
      const queried = dependencies.tasks.list(root, { status: 'active', pageSize: '12', ...(input.project ? { project: input.project } : {}) });
      const pinned = preferenceTasks('pinned-task', 'active');
      const merged = [...new Map([...pinned, ...queried.tasks.map((view: any) => item(view.record.taskId, view))].map((value) => [value.task.record.taskId, value])).values()];
      return section(merged, queried.matchingTaskCount);
    });
    const planned = readSection(() => section(preferenceTasks('planned-task', 'todo')));
    const recentResults = readSection(() => { const queried = dependencies.tasks.list(root, { status: 'completed', pageSize: '12', ...(input.project ? { project: input.project } : {}) }); return section(queried.tasks.map((view: any) => item(view.record.taskId, view)), queried.matchingTaskCount); });
    return { schemaVersion: 'buildr.workbench/v1', observedAt: new Date().toISOString(), project: input.project || null, projects, attention, active, planned, recentResults, preferences };
  }
  return Object.freeze({ inspectWorkbench });
}
