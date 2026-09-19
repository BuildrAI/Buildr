import { api } from "../../../api";
import type { Knowledge_Response } from "../../../../build/generated/knowledge-http-dto";
export type KnowledgeResponse = Knowledge_Response;
export type KnowledgeIndex = NonNullable<KnowledgeResponse["index"]>;
export type KnowledgeScope = { kind: "project" | "service"; id: string };
export const knowledgeApi = {
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
