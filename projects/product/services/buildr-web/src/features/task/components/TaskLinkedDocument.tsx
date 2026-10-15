import { useCallback, useState, type SyntheticEvent } from 'react';
import { Alert, Button } from 'antd';
import { useLocation } from 'react-router-dom';
import type { ResourcePreview } from '../../../app/resource-preview';
import { useResourcePreview } from '../../../app/resource-preview';
import { ResourceDocumentPane } from '../../../components/ResourceDocumentPane';
import { MarkdownReader } from '../../../components/MarkdownReader';
import { useAppShell } from '../../../app/AppShellContext';
import { resolveProjectMarkdownHref } from '../../../lib/projectDocuments';
import { updateMarkdownImageFailures, type MarkdownImageFailures } from '../../../lib/markdownImages';
import { taskApi, taskProjectDocumentImage, type TaskProjectDocument } from '../api/task-api';

export function taskDocumentHref(workspaceId: string | null, taskId: string, projectCode: string, file: string) {
  return `/workspaces/${workspaceId}/tasks/${encodeURIComponent(taskId)}/document?${new URLSearchParams({ project: projectCode, file })}`;
}
export function TaskLinkedDocument({ item }: { item: Extract<ResourcePreview, { kind: 'task-document' }> }) {
  const previews = useResourcePreview();
  const location = useLocation();
  const { workspaceId } = useAppShell();
  const load = useCallback(async (file: string, signal?: AbortSignal) => {
    if (!workspaceId || !item.path.startsWith(`/workspaces/${workspaceId}/`)) throw new Error('当前任务资料来源不可确认，请重新打开资料。');
    const data = await taskApi.projectDocument(item.taskId, item.projectCode, file.split('/').map(encodeURIComponent).join('/'), { signal }, workspaceId);
    return { ...data, path: data.path || file };
  }, [workspaceId, item.taskId, item.projectCode, item.path]);
  const open = (file: string) => {
    const next = item.path.split('?')[0] + '?' + new URLSearchParams({ project: item.projectCode, file });
    previews?.open(location.pathname, next);
  };
  return <div data-task-linked-document={item.taskId} data-task-linked-project={item.projectCode}>
    <ResourceDocumentPane key={JSON.stringify([workspaceId, item.taskId, item.projectCode, item.file])} file={item.file} load={load} onOpen={open}
      renderMarkdown={(document, { refresh }) => <TaskLinkedMarkdown workspaceId={workspaceId} taskId={item.taskId} projectCode={item.projectCode} document={document} refresh={refresh} onOpen={open} />} />
  </div>;
}

function TaskLinkedMarkdown({ workspaceId, taskId, projectCode, document, refresh, onOpen }: {
  workspaceId: string | null; taskId: string; projectCode: string; document: TaskProjectDocument & { path: string };
  refresh(): void; onOpen(file: string): void;
}) {
  const [failedImages, setFailedImages] = useState<MarkdownImageFailures>({ version: '', urls: [] });
  const [message, setMessage] = useState('');
  const imageVersion = JSON.stringify([workspaceId, taskId, projectCode, document.path, document.imageContext]);
  const resolveImage = (href: string) => {
    const url = taskProjectDocumentImage(workspaceId, taskId, projectCode, document.path, href, document.imageContext);
    return url ? { href: url } : null;
  };
  const imageResult = (event: SyntheticEvent<HTMLElement>, failed: boolean) => {
    if (event.target instanceof HTMLImageElement) {
      const source = event.target.getAttribute('src');
      setFailedImages(current => updateMarkdownImageFailures(current, imageVersion, source, failed, resolveImage));
    }
  };
  return <div onErrorCapture={event => imageResult(event, true)} onLoadCapture={event => imageResult(event, false)}>
    {message && <Alert type="info" message={message} />}
    {failedImages.version === imageVersion && failedImages.urls.length > 0 && <Alert type="warning" message="部分图片暂时不可读取，请刷新资料后重试。" />}
    <MarkdownReader key={imageVersion} path={document.path} content={document.content || ''} toolbarStart={<><span>{document.path.split('/').at(-1)}</span><Button type="text" size="small" onClick={refresh}>刷新资料</Button></>} options={{
      headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, sourcePath: document.path, imageResolver: resolveImage,
      onRelativeLinkClick: href => { const next = resolveProjectMarkdownHref(document.path, href); if (next) onOpen(next); else setMessage('链接不在当前对象的可读材料范围内。'); },
    }} />
  </div>;
}
