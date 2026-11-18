import { createHash } from 'node:crypto';
import type { ConversationEntry } from '../contracts.ts';

const references = new WeakMap<ConversationEntry, () => string | undefined>();
/** Reuse a verified immutable body's identity without loading its text for control projections. */
export function registerEntryRevision(entry: ConversationEntry, current: () => string | undefined): void { references.set(entry, current); }
export function entryContentRevision(entry: ConversationEntry): string {
  return references.get(entry)?.() ?? createHash('sha256').update(JSON.stringify(entry)).digest('hex');
}
