import { useEffect, useState } from "react";
import {
  knowledgeApi,
  type KnowledgeResponse,
  type KnowledgeScope,
} from "./api/knowledge-api";

/** Each reading request is bound to a scope and version of the local view. */
export function useKnowledgeReading(
  scope: KnowledgeScope,
  part?: "objects" | "artifacts" | "sources",
  id?: string | null,
  refresh = 0,
  enabled = true,
) {
  const key = JSON.stringify([
    scope.kind,
    scope.id,
    part,
    id,
    refresh,
    enabled,
  ]);
  const [state, setState] = useState<{
    key: string;
    data: KnowledgeResponse | null;
    error: string;
    loading: boolean;
  }>({ key: "", data: null, error: "", loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, data: null, error: "", loading: enabled });
    if (enabled)
      void knowledgeApi
        .read(scope, part, id || undefined, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted)
            setState({ key, data, error: "", loading: false });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setState({
              key,
              data: null,
              error: error instanceof Error ? error.message : "读取失败",
              loading: false,
            });
        });
    return () => controller.abort();
  }, [key]);
  return state.key === key
    ? state
    : { key, data: null, error: "", loading: enabled };
}
