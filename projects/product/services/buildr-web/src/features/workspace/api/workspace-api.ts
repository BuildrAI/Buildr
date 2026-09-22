import { api } from '../../../api';
import { createWorkspaceClient } from './workspace-client';
export { createWorkspaceClient } from './workspace-client';
export type { WorkspaceRegistry, WorkspaceResponse } from './workspace-client';

export const workspaceApi = createWorkspaceClient(api);
