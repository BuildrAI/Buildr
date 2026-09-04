import { api } from '../../../api';
import { taskRecordApi } from '../api/task-record-api';
import type { TaskDocumentReference, RegisteredProject } from '../../../lib/taskDocumentLinks';

export function useTaskDetail() {
  return {
    detail: taskRecordApi.detail,
    list: taskRecordApi.list,
    workspace: (signal?: AbortSignal) => api('/api/v1/workspace', { signal }),
    projects: (signal?: AbortSignal) => api('/api/v1/projects', { signal }) as Promise<{ projects?: RegisteredProject[] }>,
    change: (taskId: string, project: string, change: string, signal?: AbortSignal) => api(`/api/v1/tasks/${encodeURIComponent(taskId)}/changes/${encodeURIComponent(project)}/${encodeURIComponent(change)}`, { signal }),
    prototypes: (taskId: string, signal?: AbortSignal) => api(`/api/v1/tasks/${encodeURIComponent(taskId)}/ui-prototypes`, { signal }),
    projectDocument: (reference: TaskDocumentReference, documentPath: string) => api(`/api/v1/projects/${encodeURIComponent(reference.projectCode)}/documents/${documentPath}`),
  };
}
