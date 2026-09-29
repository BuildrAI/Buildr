import { useEffect, useState } from 'react';
import { knowledgeApi, type KnowledgeDocumentsResponse, type KnowledgeScope } from './api/knowledge-api';

export function useKnowledgeDocuments(workspaceId: string | null, scope: KnowledgeScope, refresh = 0, enabled = true) {
  const key = JSON.stringify([workspaceId, scope.kind, scope.id]);
  const [state, setState] = useState<{ key: string; data: KnowledgeDocumentsResponse | null; loading: boolean; error: string }>({ key, data: null, loading: enabled, error: '' });
  useEffect(() => {
    if (!enabled || !workspaceId) return;
    const controller = new AbortController();
    setState(previous => ({ key, data: previous.key === key ? previous.data : null, loading: true, error: '' }));
    void knowledgeApi.documents(scope, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, data, loading: false, error: '' });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : '读取文档目录失败。' }));
    });
    return () => controller.abort();
  }, [key, refresh, enabled]);
  return state.key === key ? state : { key, data: null, loading: enabled, error: '' };
}
