import { useEffect, useState } from "react";
import { knowledgeApi, type KnowledgeNavigationResponse, type KnowledgeScope } from "./api/knowledge-api";

/** Topic metadata is independent of artifact pagination and never reads a document. */
export function useKnowledgeNavigation(workspaceId: string | null, scope: KnowledgeScope, refresh = 0, enabled = true) {
  const key = JSON.stringify([workspaceId, scope.kind, scope.id]);
  const [state, setState] = useState<{ key: string; data: KnowledgeNavigationResponse | null; loading: boolean; error: string }>({ key, data: null, loading: enabled, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    if (!enabled || !workspaceId) return () => controller.abort();
    setState(previous => ({ key, data: previous.key === key ? previous.data : null, loading: true, error: "" }));
    void knowledgeApi.navigation(scope, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, data, loading: false, error: "" });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ key, data: null, loading: false, error: error instanceof Error ? error.message : "读取主题目录失败。" });
    });
    return () => controller.abort();
  }, [key, refresh, enabled]);
  return state.key === key ? state : { key, data: null, loading: enabled, error: "" };
}
