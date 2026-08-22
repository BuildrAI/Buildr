import { createApiClient } from './client';
import { LocalSessionAdapter } from './LocalSessionAdapter';
import { getWorkspaceId } from './workspaceState';
import { createTasksClient } from './tasks';
import { createTaskProfessionalClient } from './task-professional';
export type {
  TaskExecutionRecordBodyViewResponse,
  TaskExecutionRecordDetailView,
  TaskExecutionRecordsView,
  TaskExecutionRecordView,
} from './task-professional';

export { createApiClient } from './client';
export type { ApiClient, ApiError } from './client';
export { LocalSessionAdapter, readSessionTokenFromDocument } from './LocalSessionAdapter';
export type { SessionAdapter, SessionHeaders } from './LocalSessionAdapter';
export { getWorkspaceId, setWorkspaceId } from './workspaceState';

export const api = createApiClient({
  sessionAdapter: new LocalSessionAdapter(),
  getWorkspaceId,
});

export const tasksApi = createTasksClient(api);
export const taskProfessionalApi = createTaskProfessionalClient(api);
