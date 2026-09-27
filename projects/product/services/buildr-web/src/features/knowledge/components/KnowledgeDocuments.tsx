import { useEffect, useRef, useState } from 'react';
import { Alert, Empty, Spin } from 'antd';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { knowledgeApi, type KnowledgeDocument, type KnowledgeDocumentResponse, type KnowledgeScope } from '../api/knowledge-api';
import { linkedKnowledgeDocument } from '../knowledge-documents';
import './knowledge-documents.css';

type Props = {
  scope: KnowledgeScope;
  workspaceId: string;
  documents: KnowledgeDocument[];
  documentId?: string | null;
  refresh: number;
  active?: boolean;
  onOpen: (id: string, title?: string) => void;
  onArtifact: (id: string, title: string) => void;
  onLoadingChange?: (value: boolean) => void;
  onTitleChange?: (value: string) => void;
};

/** Reads one selected file. Directory search and selection live in the shared navigation. */
export function KnowledgeDocuments({ scope, workspaceId, documents, documentId, refresh, active = true, onOpen, onArtifact, onLoadingChange, onTitleChange }: Props) {
  const key = `${workspaceId}:${scope.kind}:${scope.id}:${documentId || ''}`;
  const [reading, setReading] = useState<{ key: string; data: KnowledgeDocumentResponse | null; loading: boolean; error: string }>({ key: '', data: null, loading: false, error: '' });
  const [notice, setNotice] = useState('');
  const callbacks = useRef({ onLoadingChange, onTitleChange });
  callbacks.current = { onLoadingChange, onTitleChange };
  useEffect(() => {
    setNotice('');
    if (!active || !documentId) return;
    const controller = new AbortController();
    setReading({ key, data: null, loading: true, error: '' });
    void knowledgeApi.document(scope, documentId, controller.signal).then(data => {
      if (!controller.signal.aborted) setReading({ key, data, loading: false, error: '' });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setReading({ key, data: null, loading: false, error: error instanceof Error ? error.message : '读取文档失败。' });
    });
    return () => controller.abort();
  }, [key, refresh, active]);
  const current = reading.key === key ? reading.data : null;
  const loading = Boolean(documentId) && (reading.key !== key || reading.loading);
  useEffect(() => { if (active) callbacks.current.onLoadingChange?.(loading); }, [active, loading]);
  useEffect(() => { if (active && current) callbacks.current.onTitleChange?.(current.document.title); }, [active, current]);
  const open = (document: KnowledgeDocument) => document.artifactId ? onArtifact(document.artifactId, document.title) : onOpen(document.id, document.title);
  return <section className="knowledge-documents" data-knowledge-documents>
    {!documentId ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从目录选择一份文档开始阅读。" /> : loading ? <Spin /> : reading.error ? <Alert type="error" message={reading.error} /> : current && <>
      <p className="knowledge-document-location">{current.document.group} · {current.document.path}</p>
      {notice && <Alert type="info" message={notice} closable onClose={() => setNotice('')} />}
      <MarkdownHost markdown={current.content.replace(/^# [^\n]*\n/, '')} className="markdown-body" options={{ allowRelativeLinks: true, allowParentRelativeLinks: true,
        onRelativeLinkClick: href => {
          const target = linkedKnowledgeDocument(documents, current.document, href);
          if (target) open(target);
          else setNotice('这个链接不在当前可阅读的文档目录中。可以从主题阅读查看已登记的图示与来源。');
        },
      }} />
    </>}
  </section>;
}
