import type { CodeCatalog } from './api/code-api';
export type CodeWorktree = CodeCatalog['worktrees'][number];
export type CodeWorktreeGroup = CodeCatalog['worktreeGroups'][number];
export const codeWorktreeGroupScope = (groupId?: string): string => groupId || 'main';

/** Repository choices form a union, intersected with one actual checkout group. */
export function codeFilterMembers(catalog: CodeCatalog | null, repositoryIds: string[], groupId?: string): CodeWorktree[] {
  const group = codeWorktreeGroupScope(groupId);
  return (catalog?.worktrees || []).filter(member =>
    (!repositoryIds.length || repositoryIds.includes(member.repositoryId)) &&
    member.groupId === group);
}
export function codeFilterOptions(catalog: CodeCatalog | null, repositoryIds: string[], groupId?: string) {
  const repositoryCandidates = new Set(codeFilterMembers(catalog, [], groupId).map(member => member.repositoryId));
  if (codeWorktreeGroupScope(groupId) === 'main') for (const repository of catalog?.repositories || []) repositoryCandidates.add(repository.id);
  const groupCandidates = new Set((catalog?.worktrees || []).filter(member => member.available &&
    (!repositoryIds.length || repositoryIds.includes(member.repositoryId))).map(member => member.groupId));
  if (!repositoryIds.length || catalog?.repositories.some(repository => repositoryIds.includes(repository.id))) groupCandidates.add('main');
  return {
    repositories: (catalog?.repositories || []).filter(repository => repositoryCandidates.has(repository.id)),
    groups: (catalog?.worktreeGroups || []).filter(group => groupCandidates.has(group.id)),
  };
}

/** Keep a selected disappearing checkout visible as unavailable, never substitute another directory. */
export function retainCodeSelections(next: CodeCatalog, previous: CodeCatalog | null, groupId?: string): CodeCatalog {
  if (!previous) return next;
  const group = codeWorktreeGroupScope(groupId);
  const missing = previous.worktrees.filter(member =>
    member.groupId === group && !next.worktrees.some(current => current.id === member.id));
  const missingGroups = new Set(missing.map(member => member.groupId));
  const replacement = (member: CodeWorktree) => missing.some(observed =>
    observed.repositoryId === member.repositoryId && observed.groupId === member.groupId && observed.path === member.path);
  return { ...next,
    worktrees: [...next.worktrees.filter(member => !replacement(member)), ...missing.map(member => ({ ...member, available: false }))],
    worktreeGroups: [...next.worktreeGroups, ...previous.worktreeGroups.filter(group => missingGroups.has(group.id) && !next.worktreeGroups.some(current => current.id === group.id))],
  };
}

/** Refreshing the selected group keeps its observed identity; switch away and back to accept replacements. */
export function selectCodeWorktreeGroup(latest: CodeCatalog, observed: CodeCatalog | null, previousId?: string, nextId?: string): CodeCatalog {
  const previous = codeWorktreeGroupScope(previousId), next = codeWorktreeGroupScope(nextId);
  return previous === next ? retainCodeSelections(latest, observed, next) : latest;
}
