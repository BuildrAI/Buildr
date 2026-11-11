import path from 'node:path';
import type { NativeToolContent } from '../native-content-contracts.ts';
import type { ConversationRepository } from '../persistence/conversation-repository.ts';
import type { NativeSessionReferenceProof } from '../storage/native-sessions.ts';
import { configRoot } from './native-content-resolver.ts';
import { handoffNativeReferences } from './handoff-sources.ts';

export interface NativeSessionReferences extends NativeSessionReferenceProof { diagnostics: string[] }

const providers = new Set(['codex', 'dsh']);
const modelBinding = /^connections\/(codex|dsh)\/model-bindings\/([a-f0-9]{64})(?:\/|$)/u;

/** Complete reference proof for native sessions: every canonical conversation
 * header, every durable native tool content row and every handoff source
 * index. Any unreadable source keeps its whole scope. */
export function nativeSessionReferences(root: string, repository: Pick<ConversationRepository, 'readNativeHeaders' | 'readNativeToolReferences'>): NativeSessionReferences {
  const contexts = new Set<string>(), unknownContext = new Set<string>(), unresolved = new Set<string>(), diagnostics: string[] = [];
  const headers = repository.readNativeHeaders();
  if (!headers.complete) diagnostics.push('native_session_headers_unreadable');
  for (const header of headers.headers) {
    const participants = new Map(header.participants.map(participant => [participant.id, participant]));
    for (const participant of header.participants) {
      if (!providers.has(participant.provider)) continue;
      const context = participant.contextRef?.id;
      if (typeof context === 'string' && context) contexts.add(participant.provider + ':' + context);
      if (participant.modelAccountId) {
        let config: string | undefined;
        try { config = configRoot(root, header, participant); } catch { config = undefined; }
        if (!config) unresolved.add(participant.provider);
      }
    }
    for (const attempt of header.attempts) {
      const provider = participants.get(attempt.participantId)?.provider;
      if (!provider || !providers.has(provider)) continue;
      const attemptContexts = [attempt.executionRef?.data?.resourceContext, attempt.participation?.context?.id]
        .filter((value): value is string => typeof value === 'string' && Boolean(value));
      if (attemptContexts.length) for (const context of attemptContexts) contexts.add(provider + ':' + context);
      else if (attempt.accepted === true) unknownContext.add(provider);
    }
  }
  const tools = repository.readNativeToolReferences();
  if (!tools.complete) diagnostics.push('native_session_tool_references_unreadable');
  for (const reference of tools.references) collect(reference, contexts, unresolved);
  const handoff = handoffNativeReferences(root);
  if (!handoff.complete) diagnostics.push('native_session_handoff_unreadable');
  for (const reference of handoff.references) collect(reference, contexts, unresolved);
  return { complete: headers.complete && tools.complete && handoff.complete, contexts, unknownContext, unresolved, diagnostics };
}

function collect(reference: NativeToolContent, contexts: Set<string>, unresolved: Set<string>): void {
  const provider = reference.provider;
  if (!providers.has(provider)) return;
  const contextId = reference.contextId;
  if (typeof contextId !== 'string' || !contextId) { unresolved.add(provider); return; }
  // Exact context identity protects this session even when the reference only
  // records the account root; provider-wide retention needs missing identity.
  contexts.add(provider + ':' + contextId);
  const bindings = new Set<string>();
  let conflict = false, accountRoot = false;
  const bind = (value: string) => {
    const file = value.split(path.sep).join('/');
    const match = file.match(modelBinding);
    if (!match) return;
    if (match[1] !== provider) { unresolved.add(provider); unresolved.add(match[1]!); conflict = true; return; }
    bindings.add(match[2]!);
  };
  const config = typeof reference.session?.config === 'string' ? reference.session.config : undefined;
  if (config !== undefined) {
    bind(config);
    if (new RegExp('(?:^|/)connections/' + provider + '$', 'u').test(config.split(path.sep).join('/'))) accountRoot = true;
  }
  for (const part of [...(Array.isArray(reference.text) ? reference.text : []), ...(Array.isArray(reference.input) ? reference.input : [])]) {
    if (!part || typeof part !== 'object' || !('source' in part)) continue;
    const source = (part as { source?: { path?: unknown } }).source;
    if (typeof source?.path !== 'string') continue;
    bind(source.path);
    // Durable legacy rows can point directly into the native session file; the
    // file bytes themselves are the reference even when contextId differs.
    const file = source.path.split(path.sep).join('/');
    const session = /(?:^|\/)session-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/u.exec(file)
      ?? /(?:^|\/)rollout-[^/]+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/u.exec(file);
    if (session) contexts.add(provider + ':' + session[1]!);
  }
  if (conflict) return;
  if (bindings.size > 1 || bindings.size === 0 && config !== undefined && !accountRoot) unresolved.add(provider);
}
