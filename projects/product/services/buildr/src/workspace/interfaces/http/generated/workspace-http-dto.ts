/* eslint-disable */
// Generated from workspace-http JSON Schema. Do not edit.
// Run: npm run contracts:generate:workspace

export interface WorkspaceRegistryRequestRegistryRequest {}
export interface WorkspaceRegisterRequestRegisterRequest {
  rootPath: string;
  revision: string;
  open?: boolean;
}
export interface WorkspacePickRequestPickRequest {
  revision: string;
}
export interface WorkspacePickResponsePickResponse {
  status: string;
  canceled?: boolean;
  rootPath?: string;
  workspace?: {
    id: string;
    name: string;
    description?: string;
  };
  registry?: {
    schemaVersion: string;
    revision: string;
    workspaces: {
      status: string;
      rootPath: string;
      updatedAt?: string;
      workspace?: {
        id: string;
        name: string;
        description?: string;
      } | null;
      error?: {
        code?: string;
        message: string;
      } | null;
      migrationRequired?: boolean;
    }[];
    lastOpenedWorkspaceId: string | null;
  };
  message?: string;
  prompt?: string;
}
export interface WorkspaceRemoveRequestRemoveRequest {
  revision: string;
  rootPath?: string;
  workspaceId?: string;
}
export interface WorkspaceRegistryResponseRegistryResponse {
  schemaVersion: string;
  revision: string;
  workspaces: {
    status: string;
    rootPath: string;
    updatedAt?: string;
    workspace?: {
      id: string;
      name: string;
      description?: string;
    } | null;
    error?: {
      code?: string;
      message: string;
    } | null;
    migrationRequired?: boolean;
  }[];
  lastOpenedWorkspaceId: string | null;
}
export interface WorkspaceReadRequestWorkspaceReadRequest {}
export interface WorkspaceReadResponseWorkspaceReadResponse {
  rootPath: string;
  status?: string;
  workspace: {
    id: string;
    name: string;
    description?: string;
  };
  migrationRequired?: boolean;
  schemaVersion?: string;
  revision?: string;
  compatibility?: {
    [k: string]: unknown | undefined;
  };
  nextActions?: string[];
}
export interface WorkspaceMetadataUpdateRequestMetadataUpdateRequest {
  revision: string;
  name?: string;
  description?: string;
}
export interface ProjectMetadataUpdateRequestProjectMetadataUpdateRequest {
  revision: string;
  name?: string;
  description?: string;
}
export interface ServiceMetadataUpdateRequestServiceMetadataUpdateRequest {
  revision: string;
  name?: string;
  description?: string;
  type?: string;
}
export interface ProjectHttpResponseProjectReadResponse {
  schemaVersion: string;
  revision?: string;
  migrationRequired?: boolean;
  project?: {
    id: string;
    workspaceId: string;
    code: string;
    name: string;
    description: string;
    source: {
      type: string;
      path: string;
      root?: string;
      ownership?: string;
      identity?: string;
      [k: string]: unknown | undefined;
    };
    [k: string]: unknown | undefined;
  };
  projects?: {
    id: string;
    workspaceId: string;
    code: string;
    name: string;
    description: string;
    source: {
      type: string;
      path: string;
      root?: string;
      ownership?: string;
      identity?: string;
      [k: string]: unknown | undefined;
    };
    [k: string]: unknown | undefined;
  }[];
  services?: {
    id: string;
    workspaceId: string;
    projectId: string;
    projectCode?: string;
    code: string;
    name: string;
    description: string;
    type: string;
    source: {
      type: string;
      path: string;
      root?: string;
      ownership?: string;
      identity?: string;
      [k: string]: unknown | undefined;
    };
    [k: string]: unknown | undefined;
  }[];
  service?: {
    id: string;
    workspaceId: string;
    projectId: string;
    projectCode?: string;
    code: string;
    name: string;
    description: string;
    type: string;
    source: {
      type: string;
      path: string;
      root?: string;
      ownership?: string;
      identity?: string;
      [k: string]: unknown | undefined;
    };
    [k: string]: unknown | undefined;
  };
  nextActions?: string[];
  sourceLocation?: {
    type?: string;
    path?: string;
    root?: string;
    ownership?: string;
    identity?: string;
    [k: string]: unknown | undefined;
  };
  observed?: {
    [k: string]: unknown | undefined;
  } | null;
  comparison?: {
    [k: string]: unknown | undefined;
  };
}
export interface WorkspaceDocumentResponseDocumentResponse {
  schemaVersion: string;
  path: string;
  name: string;
  entry: boolean;
  exists: boolean;
  content: string | null;
}
export interface WorkspaceErrorResponseErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
