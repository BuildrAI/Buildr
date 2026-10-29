import type { SendDraft } from './types';

type Submission = { input: SendDraft; clientRequestId: string; signature: string };
const key = (workspaceId: string, id: string) => `buildr.agent-conversation.pending-submission:${encodeURIComponent(workspaceId)}:${encodeURIComponent(id)}`;
const signature = (input: SendDraft) => {
  const {expectedRevision: _revision, modelAccountRevision: _accountRevision, ...choice} = input;
  return JSON.stringify(choice);
};
/** Retrying an unknown submission must keep both the original ID and payload. */
export function pendingSubmission(workspaceId: string, id: string, input: SendDraft, storage: Pick<Storage,'getItem'|'setItem'>, fallback?: Submission): Submission {
  const wanted = signature(input);
  try {
    const previous = JSON.parse(storage.getItem(key(workspaceId,id)) || 'null') as Submission | null;
    if (previous?.signature === wanted && previous.clientRequestId && previous.input) return previous;
  } catch { /* Same-page fallback remains available when storage is denied. */ }
  if (fallback?.signature === wanted) return fallback;
  const next = {input,clientRequestId:crypto.randomUUID(),signature:wanted};
  try { storage.setItem(key(workspaceId,id),JSON.stringify(next)); } catch { /* The backend still saves accepted submissions. */ }
  return next;
}
export function clearPendingSubmission(workspaceId: string, id: string, storage: Pick<Storage,'removeItem'>): void {
  try { storage.removeItem(key(workspaceId,id)); } catch { /* A confirmed response is sufficient in this page. */ }
}
