export type CodeSourceTarget = {repositoryId: string; checkoutId: string};
export type CodeSourceSelection = {sequence: number; origin: 'explorer' | 'source-control'; targets: CodeSourceTarget[]; preferredTarget?: CodeSourceTarget};
export const codeSourceTargetKey = (target: CodeSourceTarget) => JSON.stringify([target.repositoryId, target.checkoutId]);

/** Selection records explicit human intent; filesystem observations never write this store. */
export function createCodeSourceSelectionStore() {
  let selection: CodeSourceSelection | null = null;
  let sequence = 0;
  const listeners = new Set<() => void>();
  return {
    snapshot: () => selection,
    subscribe: (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};},
    select(origin: CodeSourceSelection['origin'], targets: CodeSourceTarget[], preferredTarget?: CodeSourceTarget) {
      const unique = [...new Map(targets.filter(target => target.repositoryId && target.checkoutId).map(target => [codeSourceTargetKey(target), {...target}])).values()];
      const preferred = preferredTarget && unique.find(target => codeSourceTargetKey(target) === codeSourceTargetKey(preferredTarget));
      // Repeating the same explicit choice is a new intent: another entry may have
      // temporarily selected a task source since the preceding publication.
      selection = {sequence:++sequence, origin, targets:unique, ...(preferred ? {preferredTarget:preferred} : {})};
      for (const listener of listeners) listener();
    },
  };
}
export type CodeSourceSelectionStore = ReturnType<typeof createCodeSourceSelectionStore>;

/** Resolve the actual checkout identity into Explorer's existing group selector. */
export function codeSourceSelectionFilter(catalog: import('./api/code-api').CodeCatalog, selection: Pick<CodeSourceSelection, 'targets' | 'preferredTarget'>) {
  const target = selection.preferredTarget || selection.targets[0];
  if (!target) return null;
  const member = catalog.worktrees.find(member => member.repositoryId === target.repositoryId && member.id === target.checkoutId);
  if (!member) return null;
  const repositoryIds = [...new Set(selection.targets.filter(target => catalog.worktrees.some(candidate => candidate.repositoryId === target.repositoryId && candidate.id === target.checkoutId && candidate.groupId === member.groupId)).map(target => target.repositoryId))];
  return {repositoryIds, groupId:repositoryIds.length===1?'checkout:'+member.id:member.groupId};
}
