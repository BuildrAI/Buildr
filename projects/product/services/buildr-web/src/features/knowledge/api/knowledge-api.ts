import { api } from "../../../api";
import type { Knowledge_Response, Knowledge_CatalogResponse } from "../../../../build/generated/knowledge-http-dto";
export type KnowledgeResponse = Knowledge_Response;
export type KnowledgeCatalogResponse = Knowledge_CatalogResponse;
export type KnowledgeCatalogItem = KnowledgeCatalogResponse["items"][number];
export type KnowledgeIndex = NonNullable<KnowledgeResponse["index"]>;
export type KnowledgeScope = { kind: "project" | "service"; id: string };
export const knowledgeApi = {
  catalog(
    scope: KnowledgeScope,
    input: { view: "documents" | "diagrams" | "maps"; q: string; pageSize: number; cursor?: string },
    signal?: AbortSignal,
  ): Promise<KnowledgeCatalogResponse> {
    const query = new URLSearchParams({ view: input.view, q: input.q, pageSize: String(input.pageSize) });
    if (input.cursor) query.set("cursor", input.cursor);
    return api(
      `/api/v1/knowledge/${scope.kind}/${encodeURIComponent(scope.id)}/catalog?${query}`,
      { signal },
    ) as Promise<KnowledgeCatalogResponse>;
  },
  read(
    scope: KnowledgeScope,
    part?: "objects" | "artifacts" | "sources",
    id?: string,
    signal?: AbortSignal,
  ): Promise<KnowledgeResponse> {
    return api(
      `/api/v1/knowledge/${scope.kind}/${encodeURIComponent(scope.id)}${part ? `/${part}/${encodeURIComponent(id || "")}` : ""}`,
      { signal },
    ) as Promise<KnowledgeResponse>;
  },
};
