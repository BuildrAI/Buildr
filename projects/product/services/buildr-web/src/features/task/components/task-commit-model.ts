import type { TaskCommitsResult } from '../../../../build/generated/task-dto';

export type TaskCommit = TaskCommitsResult['commits'][number];
export type TaskCommitsState = 'ready' | 'empty' | 'loading' | 'failure' | 'partial';
export function taskCommitKey(commit: Pick<TaskCommit, 'repositoryId' | 'hash'>): string {
  return `${encodeURIComponent(commit.repositoryId)}:${commit.hash}`;
}
export function taskCommitsState(data: TaskCommitsResult | null, loading: boolean, error: string): TaskCommitsState {
  if (data) return data.status === 'partial' ? 'partial' : data.commits.length ? 'ready' : 'empty';
  return error ? 'failure' : loading ? 'loading' : 'failure';
}
