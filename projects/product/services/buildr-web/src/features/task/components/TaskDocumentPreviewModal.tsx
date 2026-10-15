import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Alert, Button, Spin } from 'antd';
import { MarkdownReader } from '../../../components/MarkdownReader';
import { encodeProjectDocumentPath, resolveProjectMarkdownHref } from '../../../lib/projectDocuments';
import type { TaskDocumentReference } from '../../../lib/taskDocumentLinks';
import type { WorkspaceDocument } from '../hooks/useTaskArtifacts';
import { useMarkdownDocumentViewer } from '../../../lib/useMarkdownDocumentViewer';
import { updateMarkdownImageFailures, type MarkdownImageFailures } from '../../../lib/markdownImages';
import { taskProjectDocumentImage } from '../api/task-api';

type Props = {
  workspaceId: string | null;
  taskId: string;
  embedded?: boolean;
  reference: TaskDocumentReference | null;
  refreshToken?: number;
  onClose: () => void;
  loadDocument(reference: TaskDocumentReference, documentPath: string, signal?: AbortSignal): Promise<WorkspaceDocument>;
};

const documentMissingMessage = (path: string) => `项目内未找到 ${path}`;

export function TaskDocumentPreviewModal({ workspaceId, taskId, reference, onClose, loadDocument, refreshToken = 0, embedded = false }: Props) {
  const fetchDocument = useCallback((path: string, signal?: AbortSignal): Promise<WorkspaceDocument> => {
    if (!workspaceId || !reference) return Promise.reject(new Error('当前任务资料来源不可确认，请重新打开资料。'));
    return loadDocument(reference, encodeProjectDocumentPath(path), signal);
  }, [workspaceId, taskId, reference, loadDocument]);
  const documents = useMarkdownDocumentViewer(fetchDocument, documentMissingMessage);
  const document = documents.document as WorkspaceDocument | null;
  const { path: documentPath, history, loading, message } = documents;
  const observedRefreshToken = useRef({ reader: fetchDocument, token: refreshToken });
  const [failedImages, setFailedImages] = useState<MarkdownImageFailures>({ version: '', urls: [] });
  const imageVersion = JSON.stringify([workspaceId, taskId, reference?.projectCode, documentPath, document?.imageContext]);
  const resolveImage = (href: string) => {
    const url = reference ? taskProjectDocumentImage(workspaceId, taskId, reference.projectCode, documentPath, href, document?.imageContext) : null;
    return url ? { href: url } : null;
  };
  const imageResult = (event: SyntheticEvent<HTMLElement>, failed: boolean) => {
    if (event.target instanceof HTMLImageElement) {
      const source = event.target.getAttribute('src');
      setFailedImages(current => updateMarkdownImageFailures(current, imageVersion, source, failed, resolveImage));
    }
  };
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const reading = Boolean(reference);
  useEffect(() => {
    if (!reading) return;
    const origin = window.document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="dialog"]'))) return;
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); origin?.focus(); };
  }, [reading]);

  useEffect(() => {
    if (reference) void documents.open(reference.documentPath, { replaceHistory: true });
  }, [reference, fetchDocument]);

  useEffect(() => {
    const previous = observedRefreshToken.current;
    observedRefreshToken.current = { reader: fetchDocument, token: refreshToken };
    if (previous.reader !== fetchDocument || previous.token === refreshToken) return;
    // Re-read the current relative document without resetting its navigation history.
    if (reference) void documents.open(documentPath || reference.documentPath, { pushHistory: false });
  }, [refreshToken, fetchDocument]);

  const onRelativeLinkClick = (linkHref: string) => {
    const resolved = resolveProjectMarkdownHref(documentPath, linkHref);
    if (!resolved) {
      documents.setMessage('仅支持打开同一项目内的 Markdown 文档链接。');
      return;
    }
    void documents.open(resolved, { pushHistory: true });
  };

  const visibleWorkspacePath = reference
    ? `${reference.projectSourcePath === '.' ? '' : `${reference.projectSourcePath}/`}${documentPath || reference.documentPath}`
    : '';

  if (!reference) return null;
  return (
    <aside className="task-document-reader" aria-label="相关资料阅读" onErrorCapture={event => imageResult(event, true)} onLoadCapture={event => imageResult(event, false)}>
      <div className="task-document-reader-header" hidden={embedded}><strong>关联阅读</strong><Button id="task-document-close" type="text" aria-label="关闭相关资料" onClick={onClose}>关闭</Button></div>
      {reference ? (
        <div id="task-document-preview" className="task-document-preview">
          <div className="task-document-preview-heading">
            <div className="task-document-source-line">
              <small>{reference.projectName} · {!document ? '正在读取' : 'provenance' in document && (document as WorkspaceDocument & { provenance: string }).provenance === 'task-worktree-candidate' ? '任务工作树（Worktree）' : '保留目录'}</small><code id="task-document-preview-path" className="task-document-preview-path">{visibleWorkspacePath}</code>
            </div>
            {history.length > 1 ? <Button size="small" onClick={documents.back}>返回上一文档</Button> : null}
          </div>
          <p hidden={embedded} id="task-document-preview-resolution" className="task-document-preview-resolution">
            引用已解析 · {loading ? '正在确认正文' : document?.exists && document.content != null ? '正文当前可读取' : '正文当前不可读取'}
          </p>
          {message ? <Alert id="task-document-preview-message" type="warning" showIcon message={message} /> : null}
          {failedImages.version === imageVersion && failedImages.urls.length > 0 && <Alert type="warning" message="部分图片暂时不可读取，请刷新任务正文后重试。" />}
          {loading ? <div className="task-document-preview-loading"><Spin size="small" /> 正在读取文档…</div> : null}
          {!loading && document?.exists && document.content != null ? (
            <MarkdownReader
              key={imageVersion}
              toolbarStart={<span id="task-document-preview-name">{document?.name || reference.documentPath.split('/').at(-1)}</span>}
              path={documentPath}
              content={document.content}
              className="task-document-preview-content markdown-body"
              options={{
                headingOffset: 1,
                allowRelativeLinks: true,
                allowParentRelativeLinks: true,
                onRelativeLinkClick,
                imageResolver: resolveImage,
              }}
            />
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
