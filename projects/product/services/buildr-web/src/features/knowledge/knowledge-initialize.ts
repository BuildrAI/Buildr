import type { KnowledgeNavigationResponse, KnowledgeResponse } from "./api/knowledge-api";

/** Only a completed, successful whole-scope observation can offer first-time construction. */
export function canInitializeKnowledge(state: {
  data: Pick<KnowledgeNavigationResponse, "scope" | "revision" | "artifactCount"> | null;
  loading: boolean;
  error: string;
}, ...readings: Array<Pick<KnowledgeResponse, "scope" | "revision"> | null | undefined>): boolean {
  if (state.loading || state.error || state.data?.artifactCount !== 0) return false;
  const navigation = state.data;
  return !readings.some(reading => reading && reading.scope.kind === navigation.scope.kind && reading.scope.id === navigation.scope.id
    && reading.revision !== navigation.revision);
}

export function knowledgeInitializationContext(navigation: KnowledgeNavigationResponse, readingPath: string): Record<string, unknown> {
  return {
    mode: "initialize",
    scope: navigation.scope,
    indexRevision: navigation.revision,
    artifactCount: navigation.artifactCount,
    topics: navigation.topics,
    readingPath,
  };
}
