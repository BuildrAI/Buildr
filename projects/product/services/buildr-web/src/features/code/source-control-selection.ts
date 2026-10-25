import type { CodeSourceTarget } from './code-source-selection';
import { sourceControlWorktreeKey } from './source-control-model.ts';

type Scope = {key: string; worktrees: {repositoryId: string; worktreeId: string}[]};
type SharedSelection = {key: string; targets: CodeSourceTarget[]; preferredTarget?: CodeSourceTarget};

/** Resolve intent against observations; callers retain the actual reading state. */
export function resolveTaskSourceSelection<T extends {selectedWorktreeKey: string}>(input: {
  active: boolean; observed: boolean; scope?: Scope; appliedKey: string;
  baseline: {key: string; sourceKey: string}; currentSourceKey: string;
  taskId?: string; saved?: T; availableSourceKeys: string[];
}) {
  const {scope, saved} = input;
  if (!input.active || !input.observed || !scope || input.appliedKey === scope.key) return {kind: 'wait'} as const;
  if (input.baseline.key === scope.key && input.baseline.sourceKey !== input.currentSourceKey) return {kind: 'superseded'} as const;
  const valid = saved && input.availableSourceKeys.includes(saved.selectedWorktreeKey)
    && scope.worktrees.some(item => sourceControlWorktreeKey(item.repositoryId, item.worktreeId) === saved.selectedWorktreeKey) ? saved : undefined;
  const target = valid ? scope.worktrees.find(item => sourceControlWorktreeKey(item.repositoryId, item.worktreeId) === valid.selectedWorktreeKey) : scope.worktrees[0];
  return {kind: 'apply', saved: valid,
    key: valid?.selectedWorktreeKey ?? (target ? sourceControlWorktreeKey(target.repositoryId, target.worktreeId) : 'missing-task:' + (input.taskId || scope.key)),
    target: target ? {repositoryId: target.repositoryId, checkoutId: target.worktreeId} : undefined,
  } as const;
}

export function resolveSharedSourceSelection(input: {
  active: boolean; observed: boolean; scopeKey: string; currentEntry: string; selectionEpoch: string;
  appliedKey: string; selection?: SharedSelection | null; selectedIdentity: string;
}) {
  if (!input.active || !input.observed) return null;
  const {selection, scopeKey: entryKey} = input;
  if (entryKey && entryKey !== input.currentEntry) return {entryKey, appliedKey: selection?.key || ''};
  if (!selection || input.appliedKey === selection.key || entryKey && input.selectionEpoch !== entryKey) return {entryKey, appliedKey: input.appliedKey};
  const existing = selection.targets.find(target => sourceControlWorktreeKey(target.repositoryId, target.checkoutId) === input.selectedIdentity);
  const target = selection.preferredTarget || existing || selection.targets[0];
  return {entryKey, appliedKey: selection.key, nextKey: target ? sourceControlWorktreeKey(target.repositoryId, target.checkoutId) : undefined};
}
