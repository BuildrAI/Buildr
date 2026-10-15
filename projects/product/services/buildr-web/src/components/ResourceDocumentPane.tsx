import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Skeleton } from 'antd';
import { MarkdownHost } from './MarkdownHost';
import { resolveProjectMarkdownHref } from '../lib/projectDocuments';

export type ResourceDocument = { path: string; exists: boolean; content: string | null; format?: string };
export function ResourceDocumentPane<T extends ResourceDocument = ResourceDocument>({ file, load, onOpen, showHeader = true, renderMarkdown }: {
  showHeader?: boolean; file: string; load: (file: string, signal?: AbortSignal) => Promise<T>; onOpen: (file: string) => void;
  renderMarkdown?(document: T, controls: { refresh(): void }): ReactNode;
}) {
  const [document, setDocument] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setDocument(null); setError('');
    void load(file, controller.signal).then(result => { if (active) setDocument(result); }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; controller.abort(); };
  }, [file, load, retry]);
  return <article className="resource-reader">
    {showHeader ? <header><p className="resource-eyebrow">文档</p><h2>{file}</h2></header> : <p className="task-document-label">{file.split('/').at(-1)}</p>}
    {error ? <Alert type="error" message={error} action={<Button onClick={() => setRetry(r => r + 1)}>重试</Button>} /> : !document ? <Skeleton active paragraph={{ rows: 6 }} /> : !document.exists || document.content === null ? <p className="artifact-missing">未找到 {file}</p> : document.format === 'text' ? <pre className="resource-source">{document.content}</pre> : renderMarkdown ? renderMarkdown(document, { refresh: () => setRetry(r => r + 1) }) : <MarkdownHost markdown={document.content} className="markdown-body" options={{ headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick: href => { const next = resolveProjectMarkdownHref(file, href); if (next) onOpen(next); else setError('链接不在当前对象的可读材料范围内。'); } }} />}
  </article>;
}
