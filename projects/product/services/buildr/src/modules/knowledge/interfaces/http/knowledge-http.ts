import {
  KNOWLEDGE_HTTP_SCHEMAS,
  validateKnowledgeCatalogResponse,
  validateKnowledgeNavigationResponse,
  validateKnowledgeResponse,
} from "./knowledge-http-contracts.ts";
import type { createKnowledgeQuery } from "../../application/knowledge-query.ts";
import type { ScopeRef } from "../../domain/knowledge-index.ts";
export function createKnowledgeHttpContribution(
  app: ReturnType<typeof createKnowledgeQuery>,
) {
  return {
    id: "knowledge.http",
    schemas: KNOWLEDGE_HTTP_SCHEMAS,
    handle({
      request,
      suffix,
      root,
      respond,
      searchParams,
    }: {
      request: { method?: string };
      suffix: string;
      root: string;
      searchParams?: URLSearchParams;
      respond: { diagramHtml(content: string): unknown };
    }) {
      const navigation = suffix.match(/^\/knowledge\/(project|service)\/([^/]+)\/navigation$/);
      if (request.method === "GET" && navigation) {
        const id = decodeURIComponent(navigation[2]);
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id))
          return { status: 400, body: { error: "knowledge_identity_invalid" } };
        return {
          status: 200,
          body: validateKnowledgeNavigationResponse(app.navigation(
            root,
            { kind: navigation[1] as ScopeRef["kind"], id },
          )),
        };
      }
      const catalog = suffix.match(/^\/knowledge\/(project|service)\/([^/]+)\/catalog$/);
      if (request.method === "GET" && catalog) {
        const id = decodeURIComponent(catalog[2]);
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id))
          return { status: 400, body: { error: "knowledge_identity_invalid" } };
        return {
          status: 200,
          body: validateKnowledgeCatalogResponse(app.catalog(
            root,
            { kind: catalog[1] as ScopeRef["kind"], id },
            {
              view: searchParams?.get("view"),
              q: searchParams?.get("q"),
              pageSize: searchParams?.get("pageSize"),
              cursor: searchParams?.get("cursor"),
            },
          )),
        };
      }
      const display = suffix.match(
        /^\/knowledge\/(project|service)\/([^/]+)\/artifacts\/([a-zA-Z0-9._-]+)\/view$/,
      );
      if (request.method === "GET" && display) {
        const result = app.read(
          root,
          {
            kind: display[1] as ScopeRef["kind"],
            id: decodeURIComponent(display[2]),
          },
          "artifacts",
          display[3],
        );
        const a = result.artifacts?.[0];
        if (!a || a.kind !== "diagram" || a.content === null)
          return {
            status: 404,
            body: { error: "knowledge_diagram_unavailable" },
          };
        if (searchParams?.get("v") && searchParams.get("v") !== a.digest)
          return { status: 409, body: { error: "图示已变化，请刷新后重试。" } };
        respond.diagramHtml(a.content);
        return true;
      }
      const match = suffix.match(
        /^\/knowledge\/(project|service)\/([^/]+)(?:\/(objects|artifacts|sources)\/([^/]+))?$/,
      );
      if (request.method !== "GET" || !match) return null;
      const id = decodeURIComponent(match[2]),
        item = match[4] ? decodeURIComponent(match[4]) : undefined;
      if (
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id) ||
        (item && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(item))
      )
        return { status: 400, body: { error: "knowledge_identity_invalid" } };
      const result = app.read(
        root,
        { kind: match[1] as ScopeRef["kind"], id },
        match[3] as "objects" | "artifacts" | "sources" | undefined,
        item,
      );
      // HTML is delivered once by the sandboxed view endpoint. JSON keeps observations, not executable bodies.
      return {
        status: 200,
        body: validateKnowledgeResponse({
          ...result,
          artifacts: result.artifacts.map((a) => ({
            ...a,
            content: a.kind === "diagram" ? null : a.content,
            graph: a.graph ? { ...a.graph, content: null } : null,
          })),
        }),
      };
    },
  };
}
