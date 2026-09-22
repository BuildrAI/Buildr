import { useEffect, useState } from 'react';
import { knowledgeApi, type KnowledgeResponse, type KnowledgeScope } from './api/knowledge-api';
import { completeKnowledgeArtifacts, completeKnowledgeSource, type KnowledgeSourceReading } from './knowledge-reading';

export function useCompleteKnowledgeReading(workspaceId: string, scope: KnowledgeScope, part?: 'objects' | 'artifacts' | 'sources', id?: string, refresh = 0, enabled = true) {
  const key = JSON.stringify([workspaceId, scope.kind, scope.id, part, id, refresh, enabled]);
  const empty = { key, data: null, sourceReading: null, loading: enabled, error: '', relatedErrors: [] };
  const [state, setState] = useState<{ key: string; data: KnowledgeResponse | null; sourceReading: KnowledgeSourceReading | null; loading: boolean; error: string; relatedErrors: string[] }>(empty);
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, data: null, sourceReading: null, loading: enabled, error: '', relatedErrors: [] });
    if (!enabled) return () => controller.abort();
    void knowledgeApi.read(scope, part, id, controller.signal)
      .then(async data => {
        if (part === 'sources' && id) {
          const result = await completeKnowledgeSource(data, id, target => knowledgeApi.read(target, undefined, undefined, controller.signal), (target, linked) => knowledgeApi.read(target, 'artifacts', linked, controller.signal), controller.signal);
          return { data, sourceReading: result.reading, errors: result.errors };
        }
        return { ...await completeKnowledgeArtifacts(data, linked => knowledgeApi.read(scope, 'artifacts', linked, controller.signal), controller.signal), sourceReading: null };
      })
      .then(({ data, sourceReading, errors }) => {
        if (!controller.signal.aborted) setState({ key, data, sourceReading, relatedErrors: errors, loading: false, error: '' });
      }).catch(error => {
        if (!controller.signal.aborted) setState({ key, data: null, sourceReading: null, relatedErrors: [], loading: false, error: error instanceof Error ? error.message : '读取失败' });
      });
    return () => controller.abort();
  }, [key]);
  return state.key === key ? state : empty;
}
