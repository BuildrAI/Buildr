import type { KnowledgeIndex, KnowledgeNavigationResponse, KnowledgeTopic } from "./api/knowledge-api";
import type { KnowledgeCategory } from "./knowledge-catalog";

export function knowledgeReadingTopics(index: Pick<KnowledgeIndex, "objects"> | null | undefined, fallback: KnowledgeTopic[]): KnowledgeTopic[] {
  if (index === undefined) return fallback;
  return index ? index.objects.map(topic => ({ ...topic, parent: topic.parent || null })) : [];
}

export function knowledgeEntryObject(params: URLSearchParams, navigation: Pick<KnowledgeNavigationResponse, "entryObject" | "topics">): string | null {
  if (params.get("browse") === "all" || ["object", "artifact", "reading", "q"].some(key => params.has(key))
    || (params.has("view") && params.get("view") !== "documents")) return null;
  return navigation.entryObject && navigation.topics.some(topic => topic.id === navigation.entryObject) ? navigation.entryObject : null;
}

export function knowledgeTopicTrail(topics: KnowledgeTopic[], id: string | null): KnowledgeTopic[] {
  const byId = new Map(topics.map(topic => [topic.id, topic]));
  const trail: KnowledgeTopic[] = [], seen = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current && !seen.has(current.id)) {
    trail.unshift(current);
    seen.add(current.id);
    current = current.parent ? byId.get(current.parent) : undefined;
  }
  return trail;
}

export function knowledgeSelectedTopic(topics: KnowledgeTopic[], objectId?: string | null, artifactObjects: string[] = []): string | null {
  if (objectId && topics.some(topic => topic.id === objectId)) return objectId;
  return artifactObjects.length === 1 && topics.some(topic => topic.id === artifactObjects[0]) ? artifactObjects[0] : null;
}

export function knowledgeTopicArtifacts<T extends { kind: string }>(artifacts: T[], category: KnowledgeCategory): T[] {
  const kind = { documents: "document", diagrams: "diagram", maps: "code-map" }[category];
  return artifacts.filter(artifact => artifact.kind === kind || (category === "documents" && artifact.kind === "terms"));
}
