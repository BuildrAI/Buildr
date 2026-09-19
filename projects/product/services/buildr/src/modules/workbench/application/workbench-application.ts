import type { WorkbenchResponse, WorkbenchTaskItem, WorkbenchTaskSection, WorkbenchQuery, WorkbenchDiagnostic } from '../../../../build/generated/workbench-dto.ts';
import type { TaskWorkContextApplication } from '../../task/module.ts';
import type { PreferencesApplication } from './preferences-application.ts';
import { validateWorkbenchInput } from '../domain/workbench.ts';

export type WorkbenchDependencies = {
  preferences: Pick<PreferencesApplication, 'inspectWorkbenchPreferences'>;
  workContext: Pick<TaskWorkContextApplication, 'inspectTaskWorkContext' | 'queryPendingTaskWorkContexts'>;
  tasks: { list(root: string, query: any): any; inspect(root: string, taskId: string): any };
  projects(root: string): any;
  dailyProgress: { list(root: string, query: { project: string }): any; inspect(root: string, query: { project: string; date: string }): any };
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
    const dailyProgress: WorkbenchResponse['dailyProgress'] = { items: [], diagnostics: [], missingProjects: [], hasMore: false };
    const followed = new Set(preferences.items.filter((preference) => preference.kind === 'followed-project').map((preference) => preference.key));
    const relevantProjects = projects.filter((project) => !input.project || project.code === input.project).sort((a, b) => Number(followed.has(b.code)) - Number(followed.has(a.code)) || a.code.localeCompare(b.code));
    dailyProgress.hasMore = relevantProjects.length > 20;
    for (const project of relevantProjects.slice(0, 20)) {
      try {
        const date = input.date || dependencies.dailyProgress.list(root, { project: project.code }).dates[0];
        if (!date) { dailyProgress.missingProjects.push(project.code); continue; }
        const read = dependencies.dailyProgress.inspect(root, { project: project.code, date });
        if (!read.daySummary) { dailyProgress.missingProjects.push(project.code); if (read.diagnostic) dailyProgress.diagnostics.push({ ...read.diagnostic, project: project.code }); continue; }
        dailyProgress.items.push({ project: project.code, projectName: project.name, date: read.date, recordedAt: read.recordedAt, daySummary: read.daySummary, commitCount: read.commitCount, coverage: read.daySummary.drawbacks });
      } catch (failure) { dailyProgress.diagnostics.push({ ...diagnostic(failure), project: project.code }); }
    }
    dailyProgress.items.sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt) || a.project.localeCompare(b.project));
    return { schemaVersion: 'buildr.workbench/v1', observedAt: new Date().toISOString(), project: input.project || null, date: input.date || null, projects, attention, active, planned, recentResults, preferences, dailyProgress };
  }
  return Object.freeze({ inspectWorkbench });
}
