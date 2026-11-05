import { isVerificationFrameworkInput } from './ownership/scope-policy.ts';
/** Semantic concerns are orthogonal to Static / Unit / Integration / E2E. */
export const SEMANTIC_TAG_RULES = Object.freeze([
  { tag: 'handoff', pattern: /handoff|waiting-question|conversation-(?:transfer|continuation|turn)/iu },
  { tag: 'recovery', pattern: /recover|reconcil|restart|ownership|cancellation|resource-lifecycle/iu },
  { tag: 'conversation', pattern: /conversation|agent-(?:integration|unit|source|typecheck)|agent-conversations/iu },
  { tag: 'verification', pattern: /verification|planner|dag-scheduler|changed-paths|semantic-tags|impact-selection|settle-diagnostics/iu },
  { tag: 'e2e', pattern: /(?:^|[/ :_-])e2e(?:$|[/ :_-])|browser journey/iu },
]);

export function semanticTagsForStep(step: any): readonly string[] {
  const identity = [step.id, step.name, ...(step.testFiles ?? []), ...(step.executor?.files ?? []), ...(step.executor?.discoveredFiles ?? [])].join(' ');
  return Object.freeze([...new Set([...(step.tags ?? []), ...SEMANTIC_TAG_RULES.filter(rule => rule.pattern.test(identity)).map(rule => rule.tag)])].sort());
}

export function semanticTagsForPaths(paths: readonly string[]): string[] {
  // E2E is an explicit journey selector; touching one E2E file must not select every journey.
  return SEMANTIC_TAG_RULES.filter(rule => rule.tag !== 'e2e' && paths.some(file => (!isVerificationFrameworkInput(file) || rule.tag === 'verification') && rule.pattern.test(file))).map(rule => rule.tag);
}
