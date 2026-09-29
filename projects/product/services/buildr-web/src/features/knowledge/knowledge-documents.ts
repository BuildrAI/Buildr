import type { KnowledgeDocument, KnowledgeDocumentsResponse } from "./api/knowledge-api";
import { resolveKnowledgePath } from "./knowledge-navigation.ts";

export type KnowledgeDocumentSection = {
  id: string;
  title: string;
  summary: string;
  count: number;
  documents: KnowledgeDocument[];
  supplementary: KnowledgeDocument[];
};

/** Preserve the authored reading order while searching every discovered document. */
export function knowledgeDocumentSections(documents: KnowledgeDocument[], sections: KnowledgeDocumentsResponse["sections"], query = ""): KnowledgeDocumentSection[] {
  const groups: KnowledgeDocumentSection[] = sections.map(section => ({ ...section, count: 0, documents: [], supplementary: [] }));
  const search = query.trim().toLocaleLowerCase();
  for (const document of documents) {
    let group = groups.find(section => section.id === document.sectionId);
    if (!group) {
      group = groups.find(section => section.id === "unorganized");
      if (!group) {
        group = { id: "unorganized", title: "其他文档", summary: "尚未编入阅读章节的文档。", count: 0, documents: [], supplementary: [] };
        groups.push(group);
      }
    }
    if (search && !`${group.title}\n${group.summary}\n${document.title}\n${document.summary}\n${document.path}`.toLocaleLowerCase().includes(search)) continue;
    group.count++;
    (document.supplementary ? group.supplementary : group.documents).push(document);
  }
  return groups.filter(section => section.count > 0);
}

/** Relative links only select discovered files, including shared workspace reading entries. */
export function linkedKnowledgeDocument(documents: KnowledgeDocument[], from: KnowledgeDocument, href: string): KnowledgeDocument | undefined {
  const path = resolveKnowledgePath(from.path, href);
  const local = path ? documents.find(document => document.location === from.location && document.path === path) : undefined;
  if (local || !from.workspacePath) return local;
  const workspacePath = resolveKnowledgePath(from.workspacePath, href);
  return workspacePath ? documents.find(document => document.workspacePath === workspacePath) : undefined;
}
