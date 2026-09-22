import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import type { ResourcePreview } from '../../../app/resource-preview';
import { useResourcePreview } from '../../../app/resource-preview';
import { ResourceDocumentPane } from '../../../components/ResourceDocumentPane';
import { taskApi } from '../api/task-api';

export function taskDocumentHref(workspaceId: string | null, taskId: string, projectCode: string, file: string) {
  return `/workspaces/${workspaceId}/tasks/${encodeURIComponent(taskId)}/document?${new URLSearchParams({ project: projectCode, file })}`;
}
export function TaskLinkedDocument({ item }: { item: Extract<ResourcePreview, { kind: 'task-document' }> }) {
  const previews = useResourcePreview();
  const location = useLocation();
  const load = useCallback(async (file: string) => { const data = await taskApi.projectDocument(item.taskId, item.projectCode, file.split('/').map(encodeURIComponent).join('/')); return { ...data, path: data.path || file }; }, [item.taskId, item.projectCode]);
  return <ResourceDocumentPane file={item.file} load={load} onOpen={file => {
    const next = item.path.split('?')[0] + '?' + new URLSearchParams({ project: item.projectCode, file });
    previews?.open(location.pathname, next);
  }} />;
}
