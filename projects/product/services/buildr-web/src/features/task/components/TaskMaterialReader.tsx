import { useEffect, useState, type SyntheticEvent } from 'react';
import { Alert } from 'antd';
import { MarkdownReader } from '../../../components/MarkdownReader';
import { resolveTaskMaterialLink, taskMaterialSourceLabel, type TaskMaterialDocument } from '../task-materials';
import { taskMaterialImage } from '../api/task-api';
import { updateMarkdownImageFailures, type MarkdownImageFailures } from '../../../lib/markdownImages';

export function TaskMaterialReader({ workspaceId, taskId, document, documents, onMaterial, onProjectDocument, loading = false, error = null }: {
  workspaceId: string | null; taskId: string;
  document: TaskMaterialDocument; documents: TaskMaterialDocument[];
  onMaterial(id: string): void; onProjectDocument(project: string, path: string): void;
  loading?: boolean; error?: string | null;
}) {
  const [message, setMessage] = useState('');
  const [failedImages, setFailedImages] = useState<MarkdownImageFailures>({ version: '', urls: [] });
  const imageVersion = JSON.stringify([workspaceId, taskId, document.id, document.source, document.actualDigest, document.imageContext, loading, error]);
  const resolveImage = (href: string) => {
    const url = taskMaterialImage(workspaceId, taskId, document, href);
    return url ? { href: url } : null;
  };
  const imageResult = (event: SyntheticEvent<HTMLElement>, failed: boolean) => {
    if (event.target instanceof HTMLImageElement) {
      const source = event.target.getAttribute('src');
      setFailedImages(current => updateMarkdownImageFailures(current, imageVersion, source, failed, resolveImage));
    }
  };
  useEffect(() => { setMessage(''); }, [workspaceId, taskId, document.id, document.actualDigest, document.imageContext?.sourceIdentity]);
  const follow = (href: string) => {
    const target = resolveTaskMaterialLink(document, href, documents);
    if (target?.kind === 'material') onMaterial(target.id);
    else if (target?.kind === 'project') onProjectDocument(target.project, target.path);
    else setMessage('链接不在当前任务材料的安全来源范围内。');
  };
  const source = taskMaterialSourceLabel(document);
  return <article className="task-reader task-material-reader" data-task-material={document.id} data-task-material-role={document.role} data-task-material-version={document.actualDigest ?? undefined} onErrorCapture={event => imageResult(event, true)} onLoadCapture={event => imageResult(event, false)}>
    {loading && <Alert type="info" message="已读正文正在核对，当前显示上次读取的内容。" />}
    {error && <Alert type="warning" message={`任务材料读取失败：${error}`} description="当前显示上次读取的正文，尚未确认新版本。请刷新任务后重试。" />}
    {message && <Alert type="info" message={message} />}
    {failedImages.version === imageVersion && failedImages.urls.length > 0 && <Alert type="warning" message="部分图片暂时不可读取，请刷新任务正文后重试。" />}
    {document.diagnostic && <Alert type="warning" message={document.diagnostic.message} description={document.diagnostic.code} />}
    {document.exists && document.content?.trim() ? <MarkdownReader key={imageVersion} path={document.source.path} content={document.content} toolbarStart={<span title={source}>{document.title}</span>} className="markdown-body" options={{ headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick: follow, imageResolver: resolveImage }} /> : !document.diagnostic && <Alert type="warning" message="已关联材料正文缺失或为空，未使用其他正文替代。" />}
  </article>;
}
