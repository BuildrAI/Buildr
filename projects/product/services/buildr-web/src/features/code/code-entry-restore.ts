import type { CodeCatalog } from './api/code-api';
import type { CodeTaskEntry } from './code-navigation';

export type CodeEntryRestoreReason = 'replaced' | 'ambiguous' | 'missing' | 'unconfirmed';

export type CodeEntryRestore = {
  /** The observed checkout is gone; the task's current checkout can replace it explicitly. */
  reason: CodeEntryRestoreReason;
  successor: CodeCatalog['worktrees'][number] | null;
};

/** Inventory observations that cannot prove a checkout was removed. */
const incompleteInventory = new Set([
  'code_worktrees_truncated',
  'code_worktrees_unavailable',
  'code_worktree_unavailable',
  'code_worktree_identity_changed',
  'code_repository_unavailable',
]);
/** Task association observations that cannot prove the task's checkout is gone. */
const incompleteAssociation = new Set([
  'code_worktree_associations_truncated',
  'code_worktree_associations_unavailable',
  'code_worktree_evidence_unavailable',
  'code_worktree_task_unconfirmed',
  'code_worktree_task_ambiguous',
]);

type CatalogFacts = Pick<CodeCatalog, 'worktrees'> & Partial<Pick<CodeCatalog, 'diagnostics' | 'repositories'>>;

/** An incomplete read must produce a retryable diagnostic, never a removed-worktree claim. */
export function codeEntryRestoreUnconfirmed(catalog: CatalogFacts, repositoryId: string, taskId?: string) {
  const repository = catalog.repositories?.find(item => item.id === repositoryId);
  if (repository && repository.available === false) return true;
  return (catalog.diagnostics || []).some(item => {
    if (item.repositoryId !== null && item.repositoryId !== repositoryId) return false;
    return incompleteInventory.has(item.code) || (Boolean(taskId) && incompleteAssociation.has(item.code));
  });
}

/**
 * A file entry restored from browser history keeps only its observed checkout identity.
 * Task checkouts are recreated with a new identity at the same path. A current file keeps
 * the task identity as its only stable link; a historical file keeps its commit identity
 * and may use another checkout of the same repository for reading.
 */
export function resolveCodeEntryRestore(
  catalog: CatalogFacts,
  repositoryId: string,
  file: NonNullable<CodeTaskEntry['file']>,
  taskId?: string,
): CodeEntryRestore {
  if (codeEntryRestoreUnconfirmed(catalog, repositoryId, taskId)) return { reason: 'unconfirmed', successor: null };
  const current = catalog.worktrees.filter(member =>
    member.repositoryId === repositoryId && member.available && member.id !== file.checkoutId);
  // A commit is its own source identity; only the read location must be replaced.
  if (file.commitHash) {
    const taskMembers = taskId ? current.filter(member => member.groupId === 'task:' + taskId) : [];
    if (taskMembers.length === 1) return { reason: 'replaced', successor: taskMembers[0] };
    const main = current.find(member => member.isMain === true || member.groupId === 'main');
    if (main) return { reason: 'replaced', successor: main };
    if (current.length === 1) return { reason: 'replaced', successor: current[0] };
    if (!current.length) return { reason: 'missing', successor: null };
    return { reason: 'ambiguous', successor: null };
  }
  if (!taskId) return { reason: 'ambiguous', successor: null };
  const candidates = current.filter(member => member.groupId === 'task:' + taskId);
  if (candidates.length === 1) return { reason: 'replaced', successor: candidates[0] };
  if (!candidates.length) return { reason: 'missing', successor: null };
  return { reason: 'ambiguous', successor: null };
}
