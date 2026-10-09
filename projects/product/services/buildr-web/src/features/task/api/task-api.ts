import type { ApiClient, WorkspaceDocument } from '../../../api/client';
import { api } from '../../../api';
import type {
  TaskEndRequest,
  TaskEndResponse,
  TaskAbandonRequest,
  TaskAbandonResponse,
  TaskChangedFilesResult,
  TaskChangedFileCountResponse,
  TaskFileDiffRequest,
  TaskCompleteRequest,
  TaskCompleteResponse,
  TaskDetailResponse,
  TaskCommitsResult,
  TaskListRequest,
  TaskListResponse,
  TaskRetrospectiveDocumentResponse,
  TaskUpdateRequest,
  TaskUpdateResponse,
} from '../../../../build/generated/task-dto';

import type { TaskMaterialsResult, TaskMaterialDocument } from '../task-materials';
import { markdownImageQuery, type MarkdownImageContext } from '../../../lib/markdownImages';

type ReadOptions = Pick<RequestInit, 'signal'>;
export type TaskProjectDocument = WorkspaceDocument & { provenance: string; imageContext?: MarkdownImageContext };

export type ChangeArtifact = {
  path: string;
  exists: boolean;
  content?: string;
  capability?: string;
};

export type ChangePayload = {
  name: string;
  artifacts: {
    proposal: ChangeArtifact;
    design: ChangeArtifact;
    specs: ChangeArtifact[];
    tasks: ChangeArtifact;
  };
};

export function taskMaterialImage(workspaceId: string | null, taskId: string, document: TaskMaterialDocument, href: string): string | null {
  if (!workspaceId || !taskId || !document.id || !document.exists || document.diagnostic || !document.content?.trim() || !document.actualDigest || document.actualDigest !== document.imageContext?.documentDigest) return null;
  const query = markdownImageQuery(document.source.path, href, document.imageContext);
  if (!query) return null;
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/materials/${encodeURIComponent(document.id)}/image?${query}`;
}

export function taskProjectDocumentImage(workspaceId: string | null, taskId: string, projectCode: string, documentPath: string, href: string, context?: MarkdownImageContext | null): string | null {
  if (!workspaceId || !taskId || !projectCode) return null;
  const query = markdownImageQuery(documentPath, href, context);
  if (!query) return null;
  query.set('documentPath', documentPath);
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/document-image/${encodeURIComponent(projectCode)}?${query}`;
}

function queryString(input: TaskListRequest): string {
  const query = new URLSearchParams();
  for (const [field, value] of Object.entries(input)) {
    if (value !== undefined) query.set(field, value);
  }
  const rendered = query.toString();
  return rendered ? `?${rendered}` : '';
}

function typed<T>(request: Promise<unknown>): Promise<T> {
  return request as Promise<T>;
}

export function createTaskClient(client: ApiClient) {
  return Object.freeze({
    list(input: TaskListRequest = {}, options: ReadOptions = {}): Promise<TaskListResponse> {
      return typed(client(`/api/v1/tasks${queryString(input)}`, options));
    },
    detail(taskId: string, options: ReadOptions = {}): Promise<TaskDetailResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}`, options));
    },
    materials(taskId: string, options: ReadOptions = {}, workspaceId?: string | null): Promise<TaskMaterialsResult> {
      const prefix = workspaceId ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}` : '/api/v1';
      return typed(client(`${prefix}/tasks/${encodeURIComponent(taskId)}/materials`, options));
    },
    commits(taskId: string, options: ReadOptions = {}): Promise<TaskCommitsResult> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}/commits`, options));
    },
    changedFileCount(taskId: string, options: ReadOptions = {}): Promise<TaskChangedFileCountResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}/changed-file-count`, options));
    },
    changedFiles(taskId: string, options: ReadOptions = {}): Promise<TaskChangedFilesResult> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}/changed-files`, options));
    },
    fileDiff(taskId: string, input: TaskFileDiffRequest, options: ReadOptions = {}): Promise<TaskChangedFilesResult> {
      const query = new URLSearchParams({ repositoryId: input.repositoryId, filePath: input.filePath, commitHash: input.commitHash, ...(input.checkoutId ? { checkoutId: input.checkoutId } : {}) }).toString();
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}/file-diff?${query}`, options));
    },
    change(taskId: string, project: string, change: string, options: ReadOptions = {}): Promise<unknown> {
      return client(`/api/v1/tasks/${encodeURIComponent(taskId)}/changes/${encodeURIComponent(project)}/${encodeURIComponent(change)}`, options);
    },
    projectDocument(taskId: string, project: string, encodedPath: string, options: ReadOptions = {}, workspaceId?: string | null): Promise<TaskProjectDocument> {
      const prefix = workspaceId ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}` : '/api/v1';
      return typed(client(`${prefix}/tasks/${encodeURIComponent(taskId)}/documents/${encodeURIComponent(project)}/${encodedPath}`, options));
    },
    prototypes(taskId: string, options: ReadOptions = {}, workspaceId?: string): Promise<unknown> {
      const prefix = workspaceId ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}` : '/api/v1';
      return client(`${prefix}/tasks/${encodeURIComponent(taskId)}/ui-prototypes`, options);
    },
    retrospectiveDocument(taskId: string, options: ReadOptions = {}): Promise<TaskRetrospectiveDocumentResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}/retrospective-document`, options));
    },
    update(taskId: string, input: TaskUpdateRequest): Promise<TaskUpdateResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }));
    },
    complete(taskId: string, input: TaskCompleteRequest): Promise<TaskCompleteResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}/complete`, {
        method: 'POST',
        body: JSON.stringify(input),
      }));
    },
    end(taskId: string, input: TaskEndRequest): Promise<TaskEndResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}/end`, { method: 'POST', body: JSON.stringify(input) }));
    },
    abandon(taskId: string, input: TaskAbandonRequest): Promise<TaskAbandonResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}/abandon`, {
        method: 'POST',
        body: JSON.stringify(input),
      }));
    },
  });
}

export type TaskClient = ReturnType<typeof createTaskClient>;
export const taskApi = createTaskClient(api);
