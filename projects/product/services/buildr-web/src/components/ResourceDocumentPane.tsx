import { useEffect, useState } from 'react';
import { Alert, Button, Skeleton } from 'antd';
import { MarkdownHost } from './MarkdownHost';
import { resolveProjectMarkdownHref } from '../lib/projectDocuments';

export type ResourceDocument = { path: string; exists: boolean; content: string | null; format?: string };
export function ResourceDocumentPane({ file, load, onOpen }: {
  file: string; load: (file: string) => Promise<ResourceDocument>; onOpen: (file: string) => void;
}) {
  const [document, setDocument] = useState<ResourceDocument | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setDocument(null); setError('');
    void load(file).then(result => { if (active) setDocument(result); }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [file, load, retry]);
  return <article className="resource-reader">
    <header><p className="resource-eyebrow">文档</p><h2>{file}</h2></header>
    {error ? <Alert type="error" message={error} action={<Button onClick={() => setRetry(r => r + 1)}>重试</Button>} /> : !document ? <Skeleton active paragraph={{ rows: 6 }} /> : !document.exists || document.content === null ? <p className="artifact-missing">未找到 {file}</p> : document.format === 'text' ? <pre className="resource-source">{document.content}</pre> : <MarkdownHost markdown={document.content} className="markdown-body" options={{ headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick: href => { const next = resolveProjectMarkdownHref(file, href); if (next) onOpen(next); else setError('链接不在当前对象的可读材料范围内。'); } }} />}
  </article>;
}
