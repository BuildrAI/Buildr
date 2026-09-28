import { api } from "../../../api";
import type { Knowledge_Response, Knowledge_CatalogResponse, Knowledge_NavigationResponse, Knowledge_DocumentsResponse, Knowledge_DocumentResponse, Knowledge_ReferenceResponse } from "../../../../build/generated/knowledge-http-dto";
export type KnowledgeResponse = Knowledge_Response;
export type KnowledgeCatalogResponse = Knowledge_CatalogResponse;
export type KnowledgeNavigationResponse = Knowledge_NavigationResponse;
export type KnowledgeDocumentsResponse = Knowledge_DocumentsResponse;
export type KnowledgeDocumentResponse = Knowledge_DocumentResponse;
export type KnowledgeDocument = KnowledgeDocumentsResponse["documents"][number];
export type KnowledgeTopic = KnowledgeNavigationResponse["topics"][number];
export type KnowledgeCatalogItem = KnowledgeCatalogResponse["items"][number];
export type KnowledgeIndex = NonNullable<KnowledgeResponse["index"]>;
export type KnowledgeScope = { kind: "project" | "service"; id: string };
export type KnowledgeReferenceResponse = Knowledge_ReferenceResponse;
// An entry starts with no followed links; successful responses always have 1–12.
export type KnowledgeReference = Omit<KnowledgeReferenceResponse['reference'], 'links'> & { links: string[] };
export function knowledgeReferenceImage(workspaceId: string, scope: KnowledgeScope, reference: KnowledgeReference) {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/knowledge/${scope.kind}/${encodeURIComponent(scope.id)}/reference/image?${new URLSearchParams({ reference: JSON.stringify(reference) })}`;
}
export const knowledgeApi = {
  reference(scope: KnowledgeScope, reference: KnowledgeReference, signal?: AbortSignal): Promise<KnowledgeReferenceResponse> {
    return api(`/api/v1/knowledge/${scope.kind}/${encodeURIComponent(scope.id)}/reference?${new URLSearchParams({ reference: JSON.stringify(reference) })}`, { signal }) as Promise<KnowledgeReferenceResponse>;
  },
  documents(scope: KnowledgeScope, signal?: AbortSignal): Promise<KnowledgeDocumentsResponse> {
    return api(`/api/v1/knowledge/${scope.kind}/${encodeURIComponent(scope.id)}/documents`, { signal }) as Promise<KnowledgeDocumentsResponse>;
  },
  document(scope: KnowledgeScope, id: string, signal?: AbortSignal): Promise<KnowledgeDocumentResponse> {
    return api(`/api/v1/knowledge/${scope.kind}/${encodeURIComponent(scope.id)}/documents/${encodeURIComponent(id)}`, { signal }) as Promise<KnowledgeDocumentResponse>;
  },
  navigation(scope: KnowledgeScope, signal?: AbortSignal): Promise<KnowledgeNavigationResponse> {
    return api(`/api/v1/knowledge/${scope.kind}/${encodeURIComponent(scope.id)}/navigation`, { signal }) as Promise<KnowledgeNavigationResponse>;
  },
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
