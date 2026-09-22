import type { KnowledgeCatalogItem, KnowledgeCatalogResponse } from "./api/knowledge-api";
export type KnowledgeCategory = "documents" | "diagrams" | "maps";
export type KnowledgeCatalogView = Omit<KnowledgeCatalogResponse, "items"> & { items: KnowledgeCatalogItem[] };
export function knowledgeCategory(value: string | null): KnowledgeCategory {
  return value === "diagrams" || value === "maps" ? value : "documents";
}
export function knowledgeCatalogPrefetchId(items: KnowledgeCatalogItem[], hasMore: boolean) {
  return hasMore && items.length >= 15 ? items[items.length - 6]?.id : undefined;
}

export function appendKnowledgeCatalogPage(current: KnowledgeCatalogView, next: KnowledgeCatalogResponse): KnowledgeCatalogView {
  if (current.revision !== next.revision || current.scope.kind !== next.scope.kind
    || current.scope.id !== next.scope.id || current.view !== next.view
    || current.query !== next.query || current.pageSize !== next.pageSize) {
    throw Object.assign(new Error("知识目录已变化，请刷新后重试。"), { code: "knowledge_catalog_changed" });
  }
  const known = new Set(current.items.map((item) => item.id));
  const added = next.items.filter((item) => {
    if (known.has(item.id)) return false;
    known.add(item.id);
    return true;
  });
  return { ...next, items: [...current.items, ...added] };
}
