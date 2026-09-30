import type { TaskCommitsResult } from '../../../../../build/generated/task-dto.ts';
import type { TaskRecord } from '../../application/task-dto.ts';
import { taskActionId } from '../../application/task-validation.ts';
import { PUBLIC_JSON_SCHEMAS } from '../../../../infrastructure/contracts/public-json.ts';
import { parseTaskCommitTrailer } from '../domain/task-commit.ts';
import { createGitCommitReader, TASK_COMMIT_LIMITS, type CommitLimits } from '../infrastructure/git-commit-reader.ts';
import { resolveTaskRepositoryScope, type TaskRepositoryScopeDependencies } from './task-repository-scope.ts';

type Source = { path: string; root?: string; type?: string };
type Entity = { source: Source; repositorySource?: Source };
type Worktree = { selector: string; sourceRepository: string; checkoutPath: string };
export type TaskCommitsDependencies = {
  readTask(root: string, taskId: string): { root: string; record: Pick<TaskRecord, 'taskId' | 'scope' | 'changes'> };
  readProjectRegistryRecord(root: string): { registry: { migrationRequired: boolean }; projects: Record<string, Entity> };
  readServiceRegistryRecord(root: string, project: string): { services: Record<string, Entity> };
  resolveSourceRoot(root: string, source: Source): string;
  readGitWorktreeEvidence(root: string, taskId: string, options: { optional: boolean }): { evidence: { repositories: Worktree[] } } | null;
};

export function createTaskCommitsApplication(dependencies: TaskCommitsDependencies, limits: CommitLimits = TASK_COMMIT_LIMITS) {
  function inspectTaskCommits(targetRoot: string, taskIdValue: string): TaskCommitsResult {
    const taskId = taskActionId(taskIdValue, 'taskId');
    const scope = resolveTaskRepositoryScope(targetRoot, taskId, dependencies, limits);
    const reader = createGitCommitReader(limits);
    const diagnostics = scope.diagnostics;
    const commits: TaskCommitsResult['commits'] = [];
    const refs: string[] = [];
    let truncated = scope.truncated;
    const report = (code: string, message: string, reference: string | null = null, repositoryId: string | null = null, hash: string | null = null) => diagnostics.push({ code, message, reference, repositoryId, hash });
    const failureCode = (error: unknown) => error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'task_commits_repository_unavailable';
    for (const current of scope.reads.values()) {
      try {
        const result = reader.read(current.repository, [...current.heads]);
        current.view.scannedCommitCount = result.scannedCommitCount;
        if (result.truncated) { current.view.status = 'truncated'; truncated = true; }
        refs.push(...result.refs.map(ref => `${current.repository.id}:${ref}`));
        for (const failure of result.failures) report(failure.code, failure.message, null, current.repository.id, failure.hash || null);
        for (const commit of result.commits) {
          const trailer = parseTaskCommitTrailer(commit.message);
          if (trailer.diagnostic) {
            report(`task_commits_trailer_${trailer.diagnostic}`, trailer.diagnostic === 'conflict' ? '提交包含不同的任务编码，未确认唯一归属。' : '提交任务尾注的编码无效，未确认归属。', null, current.repository.id, commit.hash);
            continue;
          }
          if (trailer.taskId === taskId) commits.push({ repositoryId: current.repository.id, ...commit });
        }
      } catch (error) { current.view.status = 'unavailable'; report(failureCode(error), '代码库提交读取失败；其他代码库的结果仍保留。', null, current.repository.id); }
    }
    commits.sort((a, b) => b.committedAt.localeCompare(a.committedAt) || a.repositoryId.localeCompare(b.repositoryId) || a.hash.localeCompare(b.hash));
    if (commits.length > limits.commitLimit) { truncated = true; report('task_commits_result_truncated', `最多返回 ${limits.commitLimit} 条关联提交；当前返回数量不是全部匹配数量。`); }
    return {
      schemaVersion: PUBLIC_JSON_SCHEMAS.taskCommits, taskId, readAt: new Date().toISOString(),
      status: diagnostics.length || truncated ? 'partial' : 'complete', commits: commits.slice(0, limits.commitLimit), repositories: scope.repositories,
      coverage: { refs, repositoryLimit: limits.repositoryLimit, historyLimitPerRepository: limits.historyLimitPerRepository, commitLimit: limits.commitLimit, truncated },
      diagnostics, effects: [],
    };
  }
  return Object.freeze({ inspectTaskCommits });
}
