import { useEffect, useState, type SyntheticEvent } from 'react';
import { Alert, Button, Spin } from 'antd';
import { MarkdownReader } from '../../../components/MarkdownReader';
import { ReadOnlyFileCodeEditor } from '../../../components/file-editing/ReadOnlyFileCodeEditor';
import { taskApi, taskProjectDocumentImage, type TaskChangeAsset } from '../api/task-api';
import type { TaskChangeState } from '../hooks/useTaskArtifacts';
import { resolveDeliveryFileHref } from './task-delivery-files';
import { sourceLabel, type TaskReadTarget } from './taskWorkContent';
import './task-delivery-files.css';

export function TaskChangeAssetReader({ taskId, workspaceId, target, changes, refreshToken = 0, onRead }: {
  taskId: string; workspaceId: string | null; target: Extract<TaskReadTarget, { kind: 'change-asset' }>;
  changes: TaskChangeState[]; refreshToken?: number; onRead(target: TaskReadTarget): void;
}) {
  const source = changes.find(source => source.kind === 'ready' && source.key === target.changeKey);
  const change = source?.kind === 'ready' ? source.change : null;
  const asset = change?.assets?.find(asset => asset.relativePath === target.path && asset.sourceIdentity === target.sourceIdentity);
  const [document, setDocument] = useState<TaskChangeAsset | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [failedImage, setFailedImage] = useState(false);
  const [retry, setRetry] = useState(0);
  const identity = JSON.stringify([workspaceId, taskId, target.changeKey, target.path, target.sourceIdentity]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setDocument(null); setError(''); setMessage(''); setFailedImage(false);
    if (asset) {
      const [project, changeCode] = target.changeKey.split('/');
      void taskApi.changeAsset(taskId, project, changeCode, asset, { signal: controller.signal }, workspaceId)
        .then(value => { if (active) setDocument(value); })
        .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '资料读取失败。'); });
    }
    return () => { active = false; controller.abort(); };
  }, [identity, asset?.sourceIdentity, Boolean(asset), refreshToken, retry]);
  if (!asset || !change) return <Alert type="warning" message="资料来源已变化或当前不可读取，请刷新任务并重新选择。" />;
  const follow = (href: string) => {
    const path = resolveDeliveryFileHref(target.path, href);
    const next = path && change.assets?.find(asset => asset.relativePath === path);
    if (next) onRead({ kind: 'change-asset', changeKey: target.changeKey, path: next.relativePath, sourceIdentity: next.sourceIdentity, title: next.name });
    else {
      const prefix = asset.path.slice(0, -asset.relativePath.length);
      const standard = path ? [change.artifacts.proposal, change.artifacts.design, change.artifacts.tasks, ...change.artifacts.specs].find(item => item.path === `${prefix}${path}`) : undefined;
      if (standard?.exists) onRead({ kind: 'artifact', changeKey: target.changeKey, path: standard.path, title: path!.split('/').at(-1) || '文档' });
      else setMessage('链接不在当前变更的可读资料范围内。');
    }
  };
  const imageError = (event: SyntheticEvent<HTMLElement>) => { if (event.target instanceof HTMLImageElement) setFailedImage(true); };
  return <article className="task-reader task-change-asset-reader" data-task-change-asset={target.path} onErrorCapture={imageError}>
    <div className="task-change-asset-heading"><div><strong>{asset.name}</strong><small title={target.path}>{target.path} · {document ? sourceLabel(document.provenance) : ''}</small></div><Button size="small" type="text" onClick={() => setRetry(value => value + 1)}>刷新资料</Button></div>
    {message && <Alert type="info" message={message} />}
    {failedImage && <Alert type="warning" message="图片暂时不可读取，请刷新资料后重试。" />}
    {error ? <Alert type="warning" message={error} action={<Button size="small" onClick={() => setRetry(value => value + 1)}>重试</Button>} /> : !document ? <div className="task-content-loading"><Spin size="small" /> 正在读取资料…</div> : document.kind === 'image' ? <img className="task-delivery-image" src={document.imageDataUrl || undefined} alt={document.name} /> : document.kind === 'markdown' ? <MarkdownReader path={document.documentPath} content={document.content || ''} options={{ headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick: follow, imageResolver: href => {
      const imagePath = resolveDeliveryFileHref(target.path, href);
      const image = change.assets?.find(asset => asset.relativePath === imagePath && asset.kind === 'image');
      const url = image && document.actualDigest === document.imageContext?.documentDigest ? taskProjectDocumentImage(workspaceId, taskId, document.projectCode, document.documentPath, href, document.imageContext) : null;
      return url ? { href: url } : null;
    } }} /> : <ReadOnlyFileCodeEditor documentId={identity} path={document.name} content={document.content || ''} />}
  </article>;
}
