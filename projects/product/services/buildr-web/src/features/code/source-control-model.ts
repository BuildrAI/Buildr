import type { ChangedFileEntry } from '../task/components/TaskChangedFiles';
import type { TaskCommit } from '../task/components/task-commit-model';
import type { CodeSourceControlInput, CodeSourceControlResponse, CodeHistoryResponse, CodeCommitResponse, CodeDiffResponse, CodeSourceFileResponse } from './api/code-api';
type CodeSourceControlRepository = CodeSourceControlResponse['repositories'][number];
type CodeSourceControlWorktree = CodeSourceControlRepository['worktrees'][number];
type CodeHistoryCommit = CodeHistoryResponse['commits'][number];
type CodeChange = CodeDiffResponse['file'];

/** Display only: API inputs and file identities keep their repository-relative paths. */
export function sourceControlAbsolutePath(location: string | undefined, path: string | undefined): string | undefined {
  if (!location || !path) return undefined;
  const separator = /^[A-Za-z]:\\|^\\\\/.test(location) ? '\\' : '/';
  const root = location.replace(separator === '\\' ? /[\\/]+$/ : /\/+$/, '');
  return root + separator + path.replaceAll('/', separator);
}

export function sourceControlFileTooltip(location: string, file: Pick<ChangedFileEntry, 'path' | 'previousPath'>): string | undefined {
  const current = sourceControlAbsolutePath(location, file.path);
  return current && (file.previousPath ? sourceControlAbsolutePath(location, file.previousPath) + ' → ' + current : current);
}

/** Narrow lists need a directory only to distinguish files with the same name. */
export function sourceControlFilePathHints(files: Array<Pick<ChangedFileEntry, 'path'>>): Map<string, string> {
  const names = new Map<string, string[]>();
  for (const {path} of files) {
    const name = path.split('/').at(-1)!;
    const group = names.get(name) || [];
    group.push(path);
    names.set(name, group);
  }
  const hints = new Map<string, string>();
  for (const group of names.values()) {
    if (group.length < 2) continue;
    const directories = group.map(path => path.split('/').slice(0, -1));
    directories.forEach((parts, index) => {
      let depth = 1;
      while (depth < parts.length && directories.some((other, otherIndex) => otherIndex !== index && other.slice(-depth).join('/') === parts.slice(-depth).join('/'))) depth++;
      hints.set(group[index], parts.slice(-depth).join('/') || './');
    });
  }
  return hints;
}

export type SourceControlScene = 'changes' | 'history' | 'task' | 'full-file';
export type SourceControlState = '' | 'empty' | 'partial' | 'loading' | 'failure' | 'clean';
export type SourceControlChange = ChangedFileEntry & { worktreeId?: string | null; area: 'unstaged' | 'staged' | 'untracked'; content: string; previousContent?: string };
export type SourceControlCommit = TaskCommit & { worktreeId?: string | null; files: SourceControlChange[]; branches: string[]; tags: string[]; taskId?: string | null; taskTitle?: string | null; taskDiagnostic?: string | null };
export type SourceControlRepository = {
  id: string; name: string; location: string; taskLocation?: string; taskBranch?: string | null;
  branch: string | null; branches: string[]; ahead: number | null; behind: number | null;
  status: 'ready' | 'clean' | 'offline' | 'partial'; simulated: boolean; services: string[];
  worktrees: SourceControlWorktree[]; worktreeCount?: number | null;
  changes: SourceControlChange[]; taskChanges?: SourceControlChange[]; commits: SourceControlCommit[];
  fileCount?: number | null; head?: string | null; observedRevision?: string | null; diagnostics?: string[];
};
export type SourceControlWorktree = {
  worktreeId: string; name: string; location: string; isMain: boolean; isRegistered: boolean;
  branch: string | null; head?: string | null; ahead: number | null; behind: number | null;
  upstream?: string | null; taskId?: string | null; taskTitle?: string | null; taskDiagnostic?: string | null;
  status: SourceControlRepository['status']; changes: SourceControlChange[]; commits: SourceControlCommit[];
  fileCount: number | null; observedRevision?: string | null; diagnostics: string[];
};
export type SourceControlScopeSelection = { key: string; repositoryIds: string[]; worktrees: Array<{repositoryId: string; worktreeId: string}>; reason: string };
export const sourceControlWorktreeKey = (repositoryId: string, worktreeId: string) => JSON.stringify([repositoryId, worktreeId]);
export function sourceControlVisibleWorktrees(repository: SourceControlRepository, names: string[], exact: string[] = []) {
  return repository.worktrees.filter(worktree => (!names.length || names.includes(worktree.name)) && (!exact.length || exact.includes(sourceControlWorktreeKey(repository.id, worktree.worktreeId))));
}
export type SourceControlFileTarget = { repositoryId: string; worktreeId?: string; path: string; location: string; commitHash?: string; taskId?: string; area?: CodeSourceControlInput['area']; expectedRevision?: string };
export type SourceControlObservation = { loading: boolean; error: string; readAt: string; diagnostics: string[]; truncated?: boolean };
export type SourceControlReader = {
  history(input: CodeSourceControlInput, signal: AbortSignal): Promise<CodeHistoryResponse>;
  commit(input: CodeSourceControlInput, signal: AbortSignal): Promise<CodeCommitResponse>;
  diff(input: CodeSourceControlInput, signal: AbortSignal): Promise<CodeDiffResponse>;
  sourceFile(input: CodeSourceControlInput, signal: AbortSignal): Promise<CodeSourceFileResponse>;
};
export const sourceControlFileKey = (file: SourceControlChange) => JSON.stringify([file.repositoryId, file.worktreeId || '', file.area, file.path]);
export const sourceControlFileCount = (files: SourceControlChange[]) => new Set(files.map(file => JSON.stringify([file.worktreeId || '', file.path]))).size;
export function sourceControlChange(file: CodeChange): SourceControlChange {
  return { ...file, area: file.area === 'commit' ? 'staged' : file.area, content: '' };
}
export function sourceControlCommit(commit: CodeHistoryCommit, files: CodeChange[] = []): SourceControlCommit {
  return { ...commit, files: files.map(sourceControlChange) };
}
export function sourceControlWorktree(worktree: CodeSourceControlWorktree): SourceControlWorktree {
  return { ...worktree, status: worktree.status === 'unavailable' ? 'offline' : worktree.status === 'partial' ? 'partial' : worktree.fileCount === 0 ? 'clean' : 'ready',
    changes: worktree.changes.map(sourceControlChange), commits: [], diagnostics: worktree.diagnostics.map(item => item.message) };
}
export function sourceControlRepository(repository: CodeSourceControlRepository): SourceControlRepository {
  const taskLocation = repository.source?.kind === 'task' ? repository.source.location : undefined;
  return { id: repository.id, name: repository.name, location: repository.source?.location || repository.location,
    branch: repository.branch, branches: [], ahead: repository.ahead, behind: repository.behind,
    status: repository.status === 'unavailable' ? 'offline' : repository.status === 'partial' ? 'partial' : repository.fileCount === 0 ? 'clean' : 'ready',
    simulated: false, services: [], worktrees: repository.worktrees.map(sourceControlWorktree), worktreeCount: repository.worktreeCount, changes: repository.changes.map(sourceControlChange), commits: [],
    fileCount: repository.fileCount, head: repository.head, observedRevision: repository.observedRevision,
    diagnostics: repository.diagnostics.map(item => item.message), ...(taskLocation ? { taskLocation, taskBranch: repository.branch } : {}) };
}
