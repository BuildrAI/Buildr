import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { encodeProjectDocumentPath, resolveProjectMarkdownHref } from '../../../lib/projectDocuments';
import type { TaskDocumentReference } from '../../../lib/taskDocumentLinks';
import type { WorkspaceDocument } from '../hooks/useTaskArtifacts';

type Props = {
  reference: TaskDocumentReference | null;
  onClose: () => void;
  loadDocument(reference: TaskDocumentReference, documentPath: string): Promise<WorkspaceDocument>;
};

export function TaskDocumentPreviewModal({ reference, onClose, loadDocument }: Props) {
  const [documentPath, setDocumentPath] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [document, setDocument] = useState<WorkspaceDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestRef = useRef(0);
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

  const openDocument = async (nextPath: string, pushHistory = true) => {
    if (!reference) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setMessage(null);
    try {
      const next = await loadDocument(reference, encodeProjectDocumentPath(nextPath));
      if (requestId !== requestRef.current) return;
      const resolvedPath = next.path || nextPath;
      setDocument(next);
      setDocumentPath(resolvedPath);
      if (pushHistory) {
        setHistory((current) => current[current.length - 1] === resolvedPath ? current : [...current, resolvedPath]);
      }
      if (!next.exists || next.content == null) setMessage(`项目内未找到 ${resolvedPath}`);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setDocument(null);
      setMessage(error instanceof Error ? error.message : `无法打开 ${nextPath}`);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    requestRef.current += 1;
    setDocument(null);
    setMessage(null);
    if (!reference) {
      setDocumentPath('');
      setHistory([]);
      return;
    }
    setDocumentPath(reference.documentPath);
    setHistory([reference.documentPath]);
    void openDocument(reference.documentPath, false);
    return () => { requestRef.current += 1; };
  }, [reference]);

  const onRelativeLinkClick = (linkHref: string) => {
    const resolved = resolveProjectMarkdownHref(documentPath, linkHref);
    if (!resolved) {
      setMessage('仅支持打开同一项目内的 Markdown 文档链接。');
      return;
    }
    void openDocument(resolved);
  };

  const goBack = () => {
    if (history.length <= 1) return;
    const nextHistory = history.slice(0, -1);
    const previous = nextHistory[nextHistory.length - 1];
    setHistory(nextHistory);
    void openDocument(previous, false);
  };

  const visibleWorkspacePath = reference
    ? `${reference.projectSourcePath === '.' ? '' : `${reference.projectSourcePath}/`}${documentPath || reference.documentPath}`
    : '';

  if (!reference) return null;
  return (
    <aside className="task-document-reader" aria-label="相关资料阅读">
      <div className="task-document-reader-header"><strong>关联阅读</strong><Button id="task-document-close" type="text" aria-label="关闭相关资料" onClick={onClose}>关闭</Button></div>
      {reference ? (
        <div id="task-document-preview" className="task-document-preview">
          <div className="task-document-preview-heading">
            <div>
              <strong id="task-document-preview-name">{document?.name || reference.documentPath.split('/').at(-1)}</strong>
              <small>{reference.projectName}</small>
            </div>
            {history.length > 1 ? <Button size="small" onClick={goBack}>返回上一文档</Button> : null}
          </div>
          <code id="task-document-preview-path" className="task-document-preview-path">{visibleWorkspacePath}</code>
          <p id="task-document-preview-resolution" className="task-document-preview-resolution">
            引用已解析 · {loading ? '正在确认正文' : document?.exists && document.content != null ? '正文当前可读取' : '正文当前不可读取'}
          </p>
          {message ? <Alert id="task-document-preview-message" type="warning" showIcon message={message} /> : null}
          {loading ? <div className="task-document-preview-loading"><Spin size="small" /> 正在读取文档…</div> : null}
          {!loading && document?.exists && document.content != null ? (
            <MarkdownHost
              markdown={document.content}
              className="task-document-preview-content markdown-body"
              options={{
                headingOffset: 1,
                allowRelativeLinks: true,
                allowParentRelativeLinks: true,
                onRelativeLinkClick,
              }}
            />
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
