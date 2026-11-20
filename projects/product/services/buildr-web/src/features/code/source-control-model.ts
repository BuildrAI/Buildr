import type { CodeSourceControlResponse } from './api/code-api';
import { sourceControlChange, type SourceControlWorktree, type SourceControlRepository } from '../../../../buildr-harness-web/src/workbench-model.ts';
export * from '../../../../buildr-harness-web/src/workbench-model.ts';

type CodeSourceControlRepository = CodeSourceControlResponse['repositories'][number];
type CodeSourceControlWorktree = CodeSourceControlRepository['worktrees'][number];
export function sourceControlWorktree(worktree: CodeSourceControlWorktree): SourceControlWorktree {
  return { ...worktree, status: worktree.status === 'unavailable' ? 'offline' : worktree.status === 'partial' ? 'partial' : worktree.fileCount === 0 ? 'clean' : 'ready',
    changes: worktree.changes.map(sourceControlChange), commits: [], diagnostics: worktree.diagnostics.map(item => item.message) };
}
export function sourceControlRepository(repository: CodeSourceControlRepository): SourceControlRepository {
  const taskLocation = repository.source?.kind === 'task' ? repository.source.location : undefined;
  return { id: repository.id, code: repository.code, name: repository.name, location: repository.source?.location || repository.location, gitId:repository.gitId, checkoutId:repository.source?.checkoutId || null,
    branch: repository.branch, branches: [], ahead: repository.ahead, behind: repository.behind,
    status: repository.status === 'unavailable' ? 'offline' : repository.status === 'partial' ? 'partial' : repository.fileCount === 0 ? 'clean' : 'ready',
    clone: repository.clone ?? null,
    pending: repository.diagnostics.some(item => item.code === 'code_source_control_pending'), simulated: false, services: [], worktrees: repository.worktrees.map(sourceControlWorktree), worktreeCount: repository.worktreeCount, changes: repository.changes.map(sourceControlChange), commits: [],
    fileCount: repository.fileCount, head: repository.head, observedRevision: repository.observedRevision,
    diagnostics: repository.diagnostics.map(item => item.message), ...(taskLocation ? { taskLocation, taskBranch: repository.branch } : {}) };
}
