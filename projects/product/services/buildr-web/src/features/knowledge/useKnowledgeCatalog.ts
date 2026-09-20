import { useCallback, useEffect, useRef, useState } from "react";
import { knowledgeApi, type KnowledgeScope } from "./api/knowledge-api";
import { appendKnowledgeCatalogPage, type KnowledgeCatalogView, type KnowledgeCategory } from "./knowledge-catalog";

type State = {
  key: string;
  data: KnowledgeCatalogView | null;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  loadMoreError: string;
  changed: boolean;
};
const empty = (key: string, loading: boolean): State => ({
  key, data: null, loading, loadingMore: false, error: "", loadMoreError: "", changed: false,
});

export function useKnowledgeCatalog(input: {
  workspaceId: string | null;
  scope: KnowledgeScope;
  category: KnowledgeCategory;
  query: string;
  refresh: number;
  enabled: boolean;
}) {
  const { workspaceId, scope, category, query, refresh, enabled } = input;
  const key = JSON.stringify([workspaceId, scope.kind, scope.id, category, query, refresh]);
  const [state, setState] = useState<State>(() => empty(key, enabled));
  const currentState = useRef(state);
  currentState.current = state;
  const identity = useRef({ key, enabled });
  identity.current = { key, enabled };
  const generation = useRef(0);
  const firstRequest = useRef<AbortController | null>(null);
  const nextRequest = useRef<AbortController | null>(null);
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    const current = ++generation.current;
    firstRequest.current?.abort();
    nextRequest.current?.abort();
    firstRequest.current = null;
    nextRequest.current = null;
    attempted.current.clear();
    const saved = currentState.current.key === key ? currentState.current : null;
    // Entering an article pauses requests without throwing away the catalog.
    if (saved?.data) {
      setState({ ...saved, loading: false, loadingMore: false });
      return;
    }
    setState(empty(key, enabled));
    if (!enabled || !workspaceId) return;
    const controller = new AbortController();
    firstRequest.current = controller;
    void knowledgeApi.catalog(scope, { view: category, q: query, pageSize: 20 }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && generation.current === current && identity.current.key === key)
          setState({ ...empty(key, false), data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && generation.current === current && identity.current.key === key)
          setState({ ...empty(key, false), error: error instanceof Error ? error.message : "读取知识目录失败。" });
      });
    return () => controller.abort();
  }, [key, enabled]);

  const requestMore = useCallback(async (retry = false) => {
    const saved = currentState.current;
    const cursor = saved.data?.nextCursor;
    if (!enabled || !workspaceId || saved.key !== key || !saved.data?.hasMore || !cursor
      || saved.loading || saved.loadingMore || nextRequest.current || saved.changed
      || (!retry && (saved.loadMoreError || attempted.current.has(cursor)))) return;
    const current = generation.current;
    const controller = new AbortController();
    nextRequest.current = controller;
    attempted.current.add(cursor);
    setState((value) => ({ ...value, loadingMore: true, loadMoreError: "" }));
    try {
      const data = await knowledgeApi.catalog(scope, { view: category, q: query, pageSize: 20, cursor }, controller.signal);
      if (controller.signal.aborted || generation.current !== current || identity.current.key !== key || !identity.current.enabled) return;
      const latest = currentState.current;
      if (latest.key !== key || latest.data?.nextCursor !== cursor) return;
      const combined = appendKnowledgeCatalogPage(latest.data, data);
      setState({ ...latest, data: combined, loadingMore: false, loadMoreError: "" });
    } catch (error: unknown) {
      if (controller.signal.aborted || generation.current !== current || identity.current.key !== key) return;
      setState((value) => ({
        ...value, loadingMore: false,
        loadMoreError: error instanceof Error ? error.message : "继续读取失败。",
        changed: Boolean(error && typeof error === "object" && "code" in error && error.code === "knowledge_catalog_changed"),
      }));
    } finally {
      if (nextRequest.current === controller) nextRequest.current = null;
    }
  }, [key, enabled]);
  const loadMore = useCallback(() => { void requestMore(); }, [requestMore]);
  const retryLoadMore = useCallback(() => { void requestMore(true); }, [requestMore]);
  useEffect(() => () => {
    firstRequest.current?.abort();
    nextRequest.current?.abort();
  }, []);
  return { ...(state.key === key ? state : empty(key, enabled)), loadMore, retryLoadMore };
}
