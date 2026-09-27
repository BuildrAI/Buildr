import type { KnowledgeDocument, KnowledgeDocumentsResponse, KnowledgeNavigationResponse, KnowledgeTopic } from './api/knowledge-api';
import { knowledgeDocumentSections } from './knowledge-documents.ts';

export type ReadingFilter = 'all' | 'documents' | 'diagrams' | 'maps';
export type ReadingTarget = { kind: 'object' | 'artifact' | 'document'; id: string };
export type ReadingNode = {
  key: string;
  title: string;
  summary: string;
  search: string;
  type?: Exclude<ReadingFilter, 'all'>;
  target?: ReadingTarget;
  documentId?: string;
  children: ReadingNode[];
  supplementary?: boolean;
};
export type ReadingPreferences = {
  query: string;
  filter: ReadingFilter;
  expanded: Record<string, boolean>;
  filteredExpanded?: Record<string, Record<string, boolean>>;
};
export const emptyReadingPreferences = (): ReadingPreferences => ({ query: '', filter: 'all', expanded: {} });
type Artifact = KnowledgeNavigationResponse['artifacts'][number];
export const readingType = (kind: string): Exclude<ReadingFilter, 'all'> => kind === 'diagram' ? 'diagrams' : kind === 'code-map' ? 'maps' : 'documents';
export const readingFilter = (value: string | null): ReadingFilter => value === 'documents' || value === 'diagrams' || value === 'maps' ? value : 'all';

/** Filtered trees start expanded, with user overrides separate from the complete tree. */
function readingExpansionKey(preferences: ReadingPreferences): string | null {
  const query = preferences.query.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  return query || preferences.filter !== 'all' ? JSON.stringify([query, preferences.filter]) : null;
}

export function readingBranchOpen(preferences: ReadingPreferences, key: string): boolean {
  const view = readingExpansionKey(preferences);
  return view ? preferences.filteredExpanded?.[view]?.[key] ?? true : preferences.expanded[key] === true;
}

export function toggleReadingBranch(preferences: ReadingPreferences, key: string): ReadingPreferences {
  const open = !readingBranchOpen(preferences, key);
  const view = readingExpansionKey(preferences);
  if (!view) return { ...preferences, expanded: { ...preferences.expanded, [key]: open } };
  const saved = preferences.filteredExpanded || {};
  // Only manually changed views are remembered; keep this transient history bounded.
  const recent = Object.fromEntries(Object.entries(saved).filter(([id]) => id !== view).slice(-15));
  return { ...preferences, filteredExpanded: { ...recent, [view]: { ...saved[view], [key]: open } } };
}

export function topicReadingTree(topics: KnowledgeTopic[], artifacts: Artifact[]): ReadingNode[] {
  const ids = new Set(topics.map(topic => topic.id));
  const artifactNode = (artifact: Artifact, parent: string): ReadingNode => ({
    key: `${parent}:artifact:${artifact.id}`, title: artifact.title, summary: '', search: `${artifact.title}\n${artifact.path}`,
    type: readingType(artifact.kind), target: { kind: 'artifact', id: artifact.id }, children: [],
  });
  const visited = new Set<string>();
  const branch = (topic: KnowledgeTopic): ReadingNode => {
    visited.add(topic.id);
    return {
      key: `topic:${topic.id}`, title: topic.title, summary: topic.summary, search: `${topic.title}\n${topic.summary}`,
      target: { kind: 'object', id: topic.id }, children: [
        ...artifacts.filter(artifact => artifact.objects.includes(topic.id)).map(artifact => artifactNode(artifact, topic.id)),
        ...topics.filter(child => child.parent === topic.id && !visited.has(child.id)).map(branch),
      ],
    };
  };
  const roots = topics.filter(topic => !topic.parent || !ids.has(topic.parent)).map(branch);
  for (const topic of topics) if (!visited.has(topic.id)) roots.push(branch(topic));
  const others = artifacts.filter(artifact => !artifact.objects.some(id => ids.has(id))).map(artifact => artifactNode(artifact, 'unassigned'));
  if (others.length) roots.push({ key: 'unassigned', title: '其他资料', summary: '尚未归入主题的资料', search: '其他资料', children: others });
  return roots;
}

export function documentReadingTree(data: KnowledgeDocumentsResponse | null, artifacts: Artifact[]): ReadingNode[] {
  if (!data) return [];
  const artifactKinds = new Map(artifacts.map(artifact => [artifact.id, artifact.kind]));
  const entry = data.documents.find(document => document.id === data.entryDocumentId);
  const node = (document: KnowledgeDocument): ReadingNode => ({
    key: `document:${document.id}`, title: document.title, summary: document.summary,
    search: `${document.title}\n${document.summary}\n${document.path}`,
    type: readingType(artifactKinds.get(document.artifactId || '') || 'document'), documentId: document.id,
    target: document.artifactId ? { kind: 'artifact', id: document.artifactId } : { kind: 'document', id: document.id }, children: [],
  });
  const sections = knowledgeDocumentSections(data.documents.filter(document => document.id !== entry?.id), data.sections);
  return [
    ...(entry ? [node(entry)] : []),
    ...sections.map(section => ({
      key: `section:${section.id}`, title: section.title, summary: section.summary, search: `${section.title}\n${section.summary}`,
      children: [
        ...section.documents.map(node),
        ...(section.supplementary.length ? [{ key: `supplementary:${section.id}`, title: '补充阅读', summary: '', search: '补充阅读', supplementary: true, children: section.supplementary.map(node) }] : []),
      ],
    })),
  ];
}

/** Search expands a projection, never changing the user's saved expansion map. */
export function filterReadingTree(nodes: ReadingNode[], query: string, filter: ReadingFilter): ReadingNode[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const walk = (items: ReadingNode[], inherited = ""): ReadingNode[] => items.flatMap(node => {
    const text = `${inherited}\n${node.search}`.toLocaleLowerCase();
    const matches = terms.every(term => text.includes(term));
    const children = walk(node.children, text);
    const own = matches && (filter === 'all' || node.type === filter);
    return children.length || own ? [{ ...node, children }] : [];
  });
  return walk(nodes);
}

export function readingNodeCount(nodes: ReadingNode[]): number {
  const ids = new Set<string>();
  const visit = (items: ReadingNode[]) => items.forEach(node => {
    if (node.documentId) ids.add(`document:${node.documentId}`);
    else if (node.target?.kind === 'artifact') ids.add(`artifact:${node.target.id}`);
    visit(node.children);
  });
  visit(nodes);
  return ids.size;
}

export function readingAncestors(nodes: ReadingNode[], target: ReadingTarget | null): string[] {
  if (!target) return [];
  const walk = (items: ReadingNode[], ancestors: string[]): string[] | null => {
    for (const node of items) {
      if (node.target?.kind === target.kind && node.target.id === target.id) return ancestors;
      const found = walk(node.children, [...ancestors, node.key]);
      if (found) return found;
    }
    return null;
  };
  return walk(nodes, []) || [];
}
