import { useEffect, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import '../../../components/markdown-reader.css';
import { knowledgeApi, type KnowledgeReference, type KnowledgeReferenceResponse, type KnowledgeScope } from '../api/knowledge-api';
import { KnowledgeMarkdown } from './KnowledgeMarkdown';

type Props = {
  workspaceId: string;
  scope: KnowledgeScope;
  reference: KnowledgeReference;
  fragment?: string;
  refresh: number;
  onReference: (reference: KnowledgeReference, title: string, fragment?: string) => void;
};
export function KnowledgeReferenceReader({ workspaceId, scope, reference, fragment, refresh, onReference }: Props) {
  const key = JSON.stringify([workspaceId, scope, reference, refresh]);
  const [state, setState] = useState<{ key: string; data?: KnowledgeReferenceResponse; error?: string }>({ key: '' });
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    setRaw(false);
    const controller = new AbortController();
    void knowledgeApi.reference(scope, reference, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ key, data }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : '读取引用失败。' }); });
    return () => controller.abort();
  }, [key]);
  if (state.key !== key) return <Spin />;
  if (state.error) return <Alert type="warning" message={state.error} />;
  if (!state.data) return null;
  const { path, content } = state.data;
  return <section className="knowledge-reference-reader" data-knowledge-reference>
    <div className="markdown-reader-toolbar"><span>{path}</span>{/\.md$/i.test(path) && <Button type="text" size="small" aria-pressed={raw} onClick={() => setRaw(value => !value)}>{raw ? '阅读模式' : '查看原文'}</Button>}</div>
    {/\.md$/i.test(path) && !raw
      ? <KnowledgeMarkdown content={content} path={path} workspaceId={workspaceId} scope={scope} reference={reference} fragment={fragment} onReference={onReference} />
      : <pre className="markdown-reader-source">{content}</pre>}
  </section>;
}
