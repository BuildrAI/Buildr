import type { KnowledgeIndex } from "./api/knowledge-api";
export type KnowledgeCategory = "documents" | "diagrams" | "maps";
export function knowledgeCategory(value: string | null): KnowledgeCategory {
  return value === "diagrams" || value === "maps" ? value : "documents";
}
export function knowledgeEntries(
  index: KnowledgeIndex | null,
  category: KnowledgeCategory,
  query: string,
) {
  if (!index) return [];
  const kinds = {
    documents: "document",
    diagrams: "diagram",
    maps: "code-map",
  };
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return index.artifacts
    .filter((a) => a.kind === kinds[category])
    .map((a) => {
      const topics = index.objects.filter((o) => a.objects.includes(o.id));
      const summary = topics.map((o) => o.summary).join(" · ");
      const searchable = [
        a.title,
        a.path,
        summary,
        ...topics.map((o) => o.title),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return {
        ...a,
        summary,
        matches: terms.every((term) => searchable.includes(term)),
      };
    })
    .filter((a) => a.matches);
}
