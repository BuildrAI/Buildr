import { knowledgeError, type KnowledgeIndex } from "./knowledge-index.ts";

export type KnowledgeCatalogView = "documents" | "diagrams" | "maps";
export type KnowledgeCatalogRequest = {
  view?: string | null;
  q?: string | null;
  pageSize?: string | number | null;
  cursor?: string | null;
};
type CatalogCursor = {
  version: 1;
  scope: string;
  revision: string;
  view: KnowledgeCatalogView;
  query: string;
  pageSize: number;
  offset: number;
};
const kinds = {
  documents: "document",
  diagrams: "diagram",
  maps: "code-map",
} as const;
const invalidCursor = () =>
  knowledgeError("knowledge_catalog_cursor_invalid", "知识目录游标无效。");

function decodeCursor(value: string): CatalogCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidCursor();
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw invalidCursor();
    const cursor = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      !cursor || typeof cursor !== "object" || Array.isArray(cursor) ||
      Object.keys(cursor).sort().join(",") !== "offset,pageSize,query,revision,scope,version,view" ||
      cursor.version !== 1 ||
      typeof cursor.scope !== "string" || !/^[a-f0-9]{64}$/.test(cursor.scope) ||
      typeof cursor.revision !== "string" || !/^[a-f0-9]{64}$/.test(cursor.revision) ||
      typeof cursor.view !== "string" || !Object.hasOwn(kinds, cursor.view) || typeof cursor.query !== "string" ||
      !Number.isInteger(cursor.pageSize) || cursor.pageSize < 1 || cursor.pageSize > 20 ||
      !Number.isSafeInteger(cursor.offset) || cursor.offset < 1 ||
      cursor.offset % cursor.pageSize !== 0
    ) throw invalidCursor();
    return cursor as CatalogCursor;
  } catch {
    throw invalidCursor();
  }
}

export function knowledgeCatalogPage(
  index: KnowledgeIndex | null,
  revision: string | null,
  scopeIdentity: string,
  request: KnowledgeCatalogRequest = {},
) {
  const requestedView = request.view ?? "documents";
  if (!Object.hasOwn(kinds, requestedView))
    throw knowledgeError("knowledge_catalog_request_invalid", "知识目录分类无效。");
  const view = requestedView as KnowledgeCatalogView;
  const rawPageSize = request.pageSize ?? 20;
  if (
    (typeof rawPageSize === "string" && !/^\d+$/.test(rawPageSize)) ||
    !Number.isSafeInteger(Number(rawPageSize)) || Number(rawPageSize) < 1
  ) throw knowledgeError("knowledge_catalog_request_invalid", "知识目录页大小必须为正整数。");
  const pageSize = Math.min(Number(rawPageSize), 20);
  const query = (request.q ?? "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).join(" ");
  let offset = 0;
  if (request.cursor !== undefined && request.cursor !== null) {
    const cursor = decodeCursor(request.cursor);
    if (
      cursor.scope !== scopeIdentity || cursor.view !== view ||
      cursor.query !== query || cursor.pageSize !== pageSize
    ) throw knowledgeError("knowledge_catalog_cursor_mismatch", "知识目录游标与当前范围或查询条件不符。");
    if (cursor.revision !== revision)
      throw knowledgeError("knowledge_catalog_changed", "知识目录已变化，请刷新后重试。", 409);
    offset = cursor.offset;
  }

  const terms = query.split(" ").filter(Boolean);
  const matching = (index?.artifacts ?? [])
    .filter((artifact) => artifact.kind === kinds[view])
    .map((artifact) => {
      const topics = index!.objects.filter((object) => artifact.objects.includes(object.id));
      const summary = topics.map((object) => object.summary).join(" · ");
      return {
        item: {
          id: artifact.id,
          title: artifact.title,
          kind: artifact.kind,
          path: artifact.path,
          objects: [...artifact.objects],
          summary,
        },
        searchable: [artifact.title, artifact.path, summary, ...topics.map((object) => object.title)]
          .join(" ").toLocaleLowerCase(),
      };
    })
    .filter(({ searchable }) => terms.every((term) => searchable.includes(term)));
  if (offset > 0 && offset >= matching.length) throw invalidCursor();
  const items = matching.slice(offset, offset + pageSize).map(({ item }) => item);
  const hasMore = offset + items.length < matching.length;
  return {
    revision,
    view,
    query,
    items,
    matchingCount: matching.length,
    pageSize,
    hasMore,
    nextCursor: hasMore
      ? Buffer.from(JSON.stringify({
          version: 1,
          scope: scopeIdentity,
          revision: revision!,
          view,
          query,
          pageSize,
          offset: offset + items.length,
        } satisfies CatalogCursor)).toString("base64url")
      : null,
    diagnostics: [] as string[],
  };
}
