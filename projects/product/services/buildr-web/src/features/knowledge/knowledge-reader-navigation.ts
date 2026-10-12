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
  embeddedTypes?: Exclude<ReadingFilter, 'all'>[];
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
type ReadingRelation = { from: string; to: string; kind: string };
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

/** Article references are declared in the index; directory reads never fetch bodies. */
function referencedReadingArtifacts(artifacts: Artifact[], relations: ReadingRelation[]): Map<string, Artifact[]> {
  const byId = new Map(artifacts.map(artifact => [artifact.id, artifact]));
  const direct = new Map<string, Artifact[]>();
  for (const relation of relations) {
    const host = byId.get(relation.from), target = byId.get(relation.to);
    if (!host || !target || host.id === target.id) continue;
    const article = host.kind === 'document' || host.kind === 'terms';
    const supported = relation.kind === 'guides' ? article && (target.kind === 'diagram' || target.kind === 'code-map')
      : relation.kind === 'contains' && ((host.kind !== 'diagram' && target.kind === 'diagram') || (article && target.kind === 'code-map'));
    if (!supported) continue;
    const included = direct.get(host.id) || [];
    if (!included.some(item => item.id === target.id)) included.push(target);
    direct.set(host.id, included);
  }
  const result = new Map<string, Artifact[]>();
  for (const host of direct.keys()) {
    const seen = new Set([host]), included: Artifact[] = [], pending = [...direct.get(host)!];
    for (let position = 0; position < pending.length; position++) {
      const target = pending[position];
      if (seen.has(target.id)) continue;
      seen.add(target.id); included.push(target);
      pending.push(...(direct.get(target.id) || []));
    }
    result.set(host, included);
  }
  return result;
}

function referencedReadingFields(artifacts: Artifact[]) {
  return {
    search: artifacts.map(artifact => `${artifact.title}\n${artifact.path}`).join('\n'),
    embeddedTypes: [...new Set(artifacts.map(artifact => readingType(artifact.kind)))],
  };
}

export function topicReadingTree(topics: KnowledgeTopic[], artifacts: Artifact[], relations: ReadingRelation[] = []): ReadingNode[] {
  const ids = new Set(topics.map(topic => topic.id));
  const references = referencedReadingArtifacts(artifacts, relations);
  const artifactNode = (artifact: Artifact, parent: string): ReadingNode => {
    const embedded = referencedReadingFields(references.get(artifact.id) || []);
    return {
      key: `${parent}:artifact:${artifact.id}`, title: artifact.title, summary: '', search: `${artifact.title}\n${artifact.path}\n${embedded.search}`,
      type: readingType(artifact.kind), embeddedTypes: embedded.embeddedTypes,
      target: { kind: 'artifact', id: artifact.id }, children: [],
    };
  };
  // A figure or map can have another topic with no carrier; suppress only this group's duplicate.
  const groupNodes = (items: Artifact[], parent: string): ReadingNode[] => {
    const included = new Set(items.flatMap(artifact => references.get(artifact.id) || []).map(target => target.id));
    return items.filter(artifact => !['diagram', 'code-map'].includes(artifact.kind) || !included.has(artifact.id)).map(artifact => artifactNode(artifact, parent));
  };
  const visited = new Set<string>();
  const branch = (topic: KnowledgeTopic): ReadingNode => {
    visited.add(topic.id);
    return {
      key: `topic:${topic.id}`, title: topic.title, summary: topic.summary, search: `${topic.title}\n${topic.summary}`,
      target: { kind: 'object', id: topic.id }, children: [
        ...groupNodes(artifacts.filter(artifact => artifact.objects.includes(topic.id)), topic.id),
        ...topics.filter(child => child.parent === topic.id && !visited.has(child.id)).map(branch),
      ],
    };
  };
  const roots = topics.filter(topic => !topic.parent || !ids.has(topic.parent)).map(branch);
  for (const topic of topics) if (!visited.has(topic.id)) roots.push(branch(topic));
  const others = groupNodes(artifacts.filter(artifact => !artifact.objects.some(id => ids.has(id))), 'unassigned');
  if (others.length) roots.push({ key: 'unassigned', title: '其他资料', summary: '尚未归入主题的资料', search: '其他资料', children: others });
  return roots;
}

export function documentReadingTree(data: KnowledgeDocumentsResponse | null, artifacts: Artifact[], relations: ReadingRelation[] = []): ReadingNode[] {
  if (!data) return [];
  const artifactKinds = new Map(artifacts.map(artifact => [artifact.id, artifact.kind]));
  const references = referencedReadingArtifacts(artifacts, relations);
  const entry = data.documents.find(document => document.id === data.entryDocumentId);
  const node = (document: KnowledgeDocument): ReadingNode => {
    const embedded = referencedReadingFields(references.get(document.artifactId || '') || []);
    return {
      key: `document:${document.id}`, title: document.title, summary: document.summary,
      search: `${document.title}\n${document.summary}\n${document.path}\n${embedded.search}`,
      type: readingType(artifactKinds.get(document.artifactId || '') || 'document'), embeddedTypes: embedded.embeddedTypes, documentId: document.id,
      target: document.artifactId ? { kind: 'artifact', id: document.artifactId } : { kind: 'document', id: document.id }, children: [],
    };
  };
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
    const own = matches && (filter === 'all' || node.type === filter || node.embeddedTypes?.includes(filter));
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
