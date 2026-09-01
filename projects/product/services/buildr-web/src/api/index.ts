import { createApiClient } from './client';
import { LocalSessionAdapter } from './LocalSessionAdapter';
import { getWorkspaceId } from './workspaceState';
import { createTasksClient } from './tasks';
import { createTaskProfessionalClient } from './task-professional';
import { createWorkspaceClient } from './workspace';
import { createAgentAssetsClient } from './agentAssets';
import { createRuntimeSystemClient } from './runtimeSystem';
export type { ProjectResponse, WorkspaceResponse } from './workspace';
export type { PublicationDetail, PublicationList, ReleaseAwareness } from './runtimeSystem';

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
export const workspaceApi = createWorkspaceClient(api);
export const agentAssetsApi = createAgentAssetsClient(api);
export const runtimeSystemApi = createRuntimeSystemClient(api);
