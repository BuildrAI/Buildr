import type { KnowledgeDocument } from "./api/knowledge-api";
import { resolveKnowledgePath } from "./knowledge-navigation.ts";

export type KnowledgeDocumentNode = {
  key: string;
  title: string;
  count: number;
  document?: KnowledgeDocument;
  children: KnowledgeDocumentNode[];
};

/** The directory is derived from files; grouping never creates a second knowledge index. */
export function knowledgeDocumentTree(documents: KnowledgeDocument[], query = ""): KnowledgeDocumentNode[] {
  const roots: KnowledgeDocumentNode[] = [];
  const search = query.trim().toLocaleLowerCase();
  for (const document of documents) {
    if (search && !`${document.title}\n${document.path}\n${document.group}`.toLocaleLowerCase().includes(search)) continue;
    let root = roots.find(node => node.key === document.location);
    if (!root) {
      root = { key: document.location, title: document.group, count: 0, children: [] };
      roots.push(root);
    }
    root.count++;
    let children = root.children;
    const parts = document.path.split("/");
    for (let position = 0; position < parts.length - 1; position++) {
      const key = `${document.location}:${parts.slice(0, position + 1).join("/")}`;
      let folder = children.find(node => node.key === key);
      if (!folder) {
        folder = { key, title: parts[position], count: 0, children: [] };
        children.push(folder);
      }
      folder.count++;
      children = folder.children;
    }
    children.push({ key: `document:${document.id}`, title: document.title, count: 1, document, children: [] });
  }
  const sort = (nodes: KnowledgeDocumentNode[]) => {
    nodes.sort((a, b) => Number(Boolean(a.document)) - Number(Boolean(b.document)) || a.title.localeCompare(b.title, "zh-CN"));
    nodes.forEach(node => sort(node.children));
  };
  roots.forEach(root => sort(root.children));
  return roots;
}

/** Relative links only select discovered files, including shared workspace reading entries. */
export function linkedKnowledgeDocument(documents: KnowledgeDocument[], from: KnowledgeDocument, href: string): KnowledgeDocument | undefined {
  const path = resolveKnowledgePath(from.path, href);
  const local = path ? documents.find(document => document.location === from.location && document.path === path) : undefined;
  if (local || !from.workspacePath) return local;
  const workspacePath = resolveKnowledgePath(from.workspacePath, href);
  return workspacePath ? documents.find(document => document.workspacePath === workspacePath) : undefined;
}
