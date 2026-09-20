import type { KnowledgeIndex, KnowledgeResponse, KnowledgeScope } from './api/knowledge-api';
import { resolveKnowledgePath } from './knowledge-navigation.ts';

type Artifact = NonNullable<KnowledgeResponse['artifacts']>[number];
type SourceDocument = Pick<Artifact, 'content' | 'path'>;
export type KnowledgeSourceReading = { data: KnowledgeResponse; artifact: Artifact; scope: KnowledgeScope };

/** Only registered embedded artifacts may extend a reading response. */
export function embeddedKnowledgeIds(artifact: Pick<Artifact, 'content' | 'path'>, index: KnowledgeIndex): string[] {
  const ids = new Set<string>();
  for (const match of (artifact.content || '').matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const path = resolveKnowledgePath(artifact.path || '', match[1]);
    const linked = path && index.artifacts.find(item => item.path === path);
    if (linked) ids.add(linked.id);
  }
  return [...ids];
}

/** Complete embedded diagrams/maps without broadening the API's registered scope. */
export async function completeKnowledgeArtifacts(
  initial: KnowledgeResponse,
  read: (id: string) => Promise<KnowledgeResponse>,
  signal?: AbortSignal,
  documents: SourceDocument[] = initial.artifacts || [],
): Promise<{ data: KnowledgeResponse; errors: string[] }> {
  if (!initial.index) return { data: initial, errors: [] };
  const artifacts = [...(initial.artifacts || [])];
  const observations = new Map(initial.observations.map(item => [item.id, item]));
  const visited = new Set(artifacts.map(item => item.id));
  const errors: string[] = [];
  let pending: SourceDocument[] = documents;
  while (pending.length) {
    signal?.throwIfAborted();
    const ids = [...new Set(pending.flatMap(item => embeddedKnowledgeIds(item, initial.index!)))].filter(id => !visited.has(id));
    ids.forEach(id => visited.add(id));
    const responses = await Promise.allSettled(ids.map(read));
    signal?.throwIfAborted();
    pending = [];
    responses.forEach((result, index) => {
      const title = initial.index!.artifacts.find(item => item.id === ids[index])?.title || ids[index];
      if (result.status === 'rejected') {
        errors.push(`「${title}」暂时无法读取，请刷新后重试。`);
      } else if (result.value.revision !== initial.revision) {
        errors.push(`「${title}」的阅读关联已变化，请刷新查看当前内容。`);
      } else {
        const artifact = result.value.artifacts?.find(item => item.id === ids[index]);
        if (artifact) { artifacts.push(artifact); pending.push(artifact); }
        else errors.push(`「${title}」暂无可阅读内容。`);
        // Artifact reads contain metadata only; keep a source body already read in this response.
        result.value.observations.forEach(item => { if (observations.get(item.id)?.content == null) observations.set(item.id, item); });
      }
    });
  }
  return { data: { ...initial, artifacts, observations: [...observations.values()] }, errors };
}

/** A source body resolves references from its observed location, never its referring project's aliases. */
export async function completeKnowledgeSource(
  initial: KnowledgeResponse,
  sourceId: string,
  readScope: (scope: KnowledgeScope) => Promise<KnowledgeResponse>,
  readArtifact: (scope: KnowledgeScope, id: string) => Promise<KnowledgeResponse>,
  signal?: AbortSignal,
): Promise<{ reading: KnowledgeSourceReading | null; errors: string[] }> {
  const source = initial.observations.find(item => item.id === sourceId);
  const meta = initial.index?.sources.find(item => item.id === sourceId);
  if (source?.content == null || !source.path?.toLowerCase().endsWith('.md')) return { reading: null, errors: [] };
  const sourceArtifact: Artifact = {
    id: `source:${sourceId}`, title: meta?.title || sourceId, kind: 'document', path: source.path,
    objects: [], sources: [], content: source.content, digest: source.digest, status: source.status, diagnostic: source.diagnostic, diagramSize: null, graph: null,
  };
  if (meta?.kind === 'skill' && meta.skillId && source.skill?.id === meta.skillId) {
    // A skill reference is relative to that skill's directory, not to the knowledge article that cited it.
    const index = initial.index && { ...initial.index, artifacts: [], objects: [], sources: initial.index.sources.filter(item => item.kind === 'skill' && item.skillId === meta.skillId).map(item => ({ ...item, link: item.path })) };
    return { reading: { scope: { kind: initial.scope.kind, id: initial.scope.id }, data: { ...initial, index, artifacts: [] }, artifact: sourceArtifact }, errors: [] };
  }
  const location = source.location;
  if (!location) return { reading: null, errors: [] };
  const scope = { kind: location.kind, id: location.id };
  const sameScope = scope.kind === initial.scope.kind && scope.id === initial.scope.id;
  let target: KnowledgeResponse;
  try { target = sameScope ? initial : await readScope(scope); }
  catch {
    signal?.throwIfAborted();
    return { reading: null, errors: ['来源所属范围的阅读关联暂不可用，已保留真实正文。'] };
  }
  signal?.throwIfAborted();
  if (target.scope.kind !== scope.kind || target.scope.id !== scope.id) return { reading: null, errors: ['来源与阅读范围不一致，已保留真实正文。'] };
  const inKnowledgeRoot = location.root === target.scope.directory;
  const inCodeRoot = location.root === target.scope.codeRoot;
  if (!inKnowledgeRoot && !inCodeRoot) return { reading: null, errors: ['来源位置不在当前已登记阅读范围，已保留真实正文。'] };
  // Code roots and service governance directories are separate coordinates. Only explicit code sources in the same root can match code-relative links.
  const index = !target.index || inKnowledgeRoot ? target.index : {
    ...target.index,
    artifacts: [],
    sources: target.index.sources.filter(item => item.kind === 'code' && (!item.scope || item.scope.kind === scope.kind && [scope.id, target.scope.code].includes(item.scope.id)))
      .map(item => ({ ...item, link: item.path })),
  };
  const matched = index?.artifacts.find(item => item.path === source.path);
  const artifact: Artifact = {
    ...sourceArtifact, id: matched?.id || sourceArtifact.id, kind: matched?.kind || 'document',
    objects: matched?.objects || [], sources: matched?.sources || [], files: matched?.files,
  };
  const completed = await completeKnowledgeArtifacts({ ...target, index, artifacts: [] }, id => readArtifact(scope, id), signal, [artifact]);
  return { reading: { scope, data: completed.data, artifact }, errors: completed.errors };
}
