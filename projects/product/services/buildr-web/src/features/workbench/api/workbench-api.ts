import { api, type ApiClient } from '../../../api';
import type {
  TaskWorkContextResponse, TaskWorkContextRecordRequest, TaskWorkContextRespondRequest,
  WorkbenchResponse, WorkbenchQuery, WorkbenchPreference, WorkbenchPreferencesResponse,
  WorkbenchPreferencePutRequest, WorkbenchVisitRequest,
} from '../../../../build/generated/workbench-dto';

export type { WorkbenchResponse, WorkbenchPreference, WorkbenchPreferencesResponse, WorkbenchVisitRequest };
export type PreferenceKind = WorkbenchPreference['kind'];
type ReadOptions = Pick<RequestInit, 'signal'>;

/** Both scoped hooks and task clients consume the same generated HTTP contract. */
export function createWorkbenchClient(client: ApiClient, workspaceId?: string) {
  const path = (suffix: string) => '/api/v1' + (workspaceId ? '/workspaces/' + encodeURIComponent(workspaceId) : '') + suffix;
  return {
    overview(input: WorkbenchQuery = {}, options: ReadOptions = {}): Promise<WorkbenchResponse> {
      const query = new URLSearchParams();
      if (input.project) query.set('project', input.project);
      if (input.date) query.set('date', input.date);
      return client(path('/workbench') + (query.size ? '?' + query : ''), options) as Promise<WorkbenchResponse>;
    },
    preferences(options: ReadOptions = {}): Promise<WorkbenchPreferencesResponse> {
      return client(path('/workbench/preferences'), options) as Promise<WorkbenchPreferencesResponse>;
    },
    setPreference(kind: PreferenceKind, key: string, input: WorkbenchPreferencePutRequest = {}): Promise<WorkbenchPreferencesResponse> {
      return client(path('/workbench/preferences/' + kind + '/' + encodeURIComponent(key)), {
        method: 'PUT', body: JSON.stringify(input),
      }) as Promise<WorkbenchPreferencesResponse>;
    },
    removePreference(kind: PreferenceKind, key: string): Promise<WorkbenchPreferencesResponse> {
      return client(path('/workbench/preferences/' + kind + '/' + encodeURIComponent(key)), { method: 'DELETE' }) as Promise<WorkbenchPreferencesResponse>;
    },
    visit(input: WorkbenchVisitRequest): Promise<WorkbenchPreferencesResponse> {
      return client(path('/workbench/visits'), { method: 'POST', body: JSON.stringify(input) }) as Promise<WorkbenchPreferencesResponse>;
    },
    context(taskId: string, options: ReadOptions = {}): Promise<TaskWorkContextResponse> {
      return client(path('/tasks/' + encodeURIComponent(taskId) + '/work-context'), options) as Promise<TaskWorkContextResponse>;
    },
    recordContext(taskId: string, input: TaskWorkContextRecordRequest): Promise<TaskWorkContextResponse> {
      return client(path('/tasks/' + encodeURIComponent(taskId) + '/work-context'), { method: 'PUT', body: JSON.stringify(input) }) as Promise<TaskWorkContextResponse>;
    },
    respond(taskId: string, input: TaskWorkContextRespondRequest): Promise<TaskWorkContextResponse> {
      return client(path('/tasks/' + encodeURIComponent(taskId) + '/work-context/respond'), { method: 'POST', body: JSON.stringify(input) }) as Promise<TaskWorkContextResponse>;
    },
  };
}

export const workbenchApi = createWorkbenchClient(api);
