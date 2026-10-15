import type { CodeSourceControlResponse } from './api/code-api';
import type { SourceControlCatalogState } from './source-control-catalog';

type Repository = CodeSourceControlResponse['repositories'][number];
type Worktree = Repository['worktrees'][number];
type Diagnostic = Repository['diagnostics'][number];
const incomplete = (status: Repository['status']) => status === 'partial' || status === 'unavailable';
const pending = (diagnostics: Diagnostic[]) => diagnostics.some(item => item.code === 'code_source_control_pending');
const sourceName = (repository: Repository, worktree?: Worktree) => {
  const location = worktree?.location || repository.location;
  const name = worktree?.name || location.split(/[\\/]/u).filter(Boolean).at(-1) || location;
  return [repository.name || repository.id, name, location].filter(Boolean).join(' · ');
};

/** A successful HTTP response can still contain failed or budget-limited Git reads. */
export function sourceControlReadDiagnostics(state: Pick<SourceControlCatalogState, 'data' | 'error' | 'repositoryErrors'>) {
  const messages = new Set<string>(), failed = new Set<string>();
  const globalError = state.error.trim();
  if (globalError) messages.add(globalError);
  for (const [id, value] of Object.entries(state.repositoryErrors)) {
    const message = value.trim();
    if (!message) continue;
    const repository = state.data?.repositories.find(item => item.id === id);
    messages.add((repository ? sourceName(repository) : id) + '：' + message);
    failed.add(id);
  }
  for (const repository of state.data?.repositories || []) {
    const add = (diagnostic: Diagnostic, worktree?: Worktree) => {
      const message = diagnostic.message.trim();
      // Task associations do not change the success of a Git status read.
      if (message && diagnostic.code !== 'code_source_control_pending' && !diagnostic.code.startsWith('code_task_')) messages.add(sourceName(repository, worktree) + '：' + message);
    };
    if (incomplete(repository.status) && !pending(repository.diagnostics)) failed.add(repository.id);
    for (const worktree of repository.worktrees) {
      if (!incomplete(worktree.status) || pending(worktree.diagnostics)) continue;
      failed.add(repository.id);
      for (const diagnostic of worktree.diagnostics) add(diagnostic, worktree);
    }
    for (const diagnostic of repository.diagnostics) {
      const worktree = diagnostic.worktreeId ? repository.worktrees.find(item => item.worktreeId === diagnostic.worktreeId) : undefined;
      if (worktree ? incomplete(worktree.status) : incomplete(repository.status)) add(diagnostic, worktree);
    }
  }
  return {readDiagnostics:[...messages], failedRepositoryIds:[...failed]};
}
