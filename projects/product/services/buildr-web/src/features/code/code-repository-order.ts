export type CodeRepositoryOrderItem = {
  id?: string;
  name?: string | null;
  code?: string | null;
  location?: string | null;
};

const canonicalRoot = (value?: string | null) => {
  const path = (value || '').replace(/\\/g, '/').replace(/\/+$/u, '');
  return /^[A-Za-z]:\//u.test(path) || path.startsWith('//') ? path.toLowerCase() : path;
};

/** Known limit: location arrives realpath-resolved while workspaceRoot keeps the registered spelling, so a symlinked root loses only its first position until the workspace contract carries a resolved root. */
export function codeRepositoryIsWorkspace(repository: CodeRepositoryOrderItem, workspaceRoot?: string | null): boolean {
  if (!workspaceRoot || !repository.location) return false;
  return canonicalRoot(repository.location) === canonicalRoot(workspaceRoot);
}

const repositoryCode = (repository: CodeRepositoryOrderItem) => repository.code || repository.name || repository.id || '';

/** Workspace first; callers can place changed repositories before the remaining code-sorted list. */
export function orderCodeRepositories<T extends CodeRepositoryOrderItem>(
  repositories: readonly T[],
  workspaceRoot?: string | null,
  hasChanges?: (repository: T) => boolean,
): T[] {
  const rank = (repository: T) => codeRepositoryIsWorkspace(repository, workspaceRoot) ? 0 : hasChanges?.(repository) ? 1 : hasChanges ? 2 : 1;
  return [...repositories].sort((left, right) => rank(left) - rank(right)
    || repositoryCode(left).localeCompare(repositoryCode(right), undefined, { numeric: true, sensitivity: 'base' }));
}
