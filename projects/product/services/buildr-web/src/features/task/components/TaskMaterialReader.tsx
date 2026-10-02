import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { MarkdownReader } from '../../../components/MarkdownReader';
import { resolveTaskMaterialLink, taskMaterialSourceLabel, type TaskMaterialDocument } from '../task-materials';

export function TaskMaterialReader({ document, documents, onMaterial, onProjectDocument, loading = false, error = null }: {
  document: TaskMaterialDocument; documents: TaskMaterialDocument[];
  onMaterial(id: string): void; onProjectDocument(project: string, path: string): void;
  loading?: boolean; error?: string | null;
}) {
  const [message, setMessage] = useState('');
  useEffect(() => { setMessage(''); }, [document.id, document.actualDigest]);
  const follow = (href: string) => {
    const target = resolveTaskMaterialLink(document, href, documents);
    if (target?.kind === 'material') onMaterial(target.id);
    else if (target?.kind === 'project') onProjectDocument(target.project, target.path);
    else setMessage('链接不在当前任务材料的安全来源范围内。');
  };
  const source = taskMaterialSourceLabel(document);
  return <article className="task-reader task-material-reader" data-task-material={document.id} data-task-material-role={document.role} data-task-material-version={document.actualDigest ?? undefined}>
    {loading && <Alert type="info" message="已读正文正在核对，当前显示上次读取的内容。" />}
    {error && <Alert type="warning" message={`任务材料读取失败：${error}`} description="当前显示上次读取的正文，尚未确认新版本。请刷新任务后重试。" />}
    {message && <Alert type="info" message={message} />}
    {document.diagnostic && <Alert type="warning" message={document.diagnostic.message} description={document.diagnostic.code} />}
    {document.exists && document.content?.trim() ? <MarkdownReader path={document.source.path} content={document.content} toolbarStart={<span title={source}>{document.title}</span>} className="markdown-body" options={{ headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick: follow }} /> : !document.diagnostic && <Alert type="warning" message="已关联材料正文缺失或为空，未使用其他正文替代。" />}
  </article>;
}
