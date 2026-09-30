import type { TaskChangedFilesResult, TaskCommitsResult } from '../../../../../build/generated/task-dto.ts';
import { taskActionId } from '../../application/task-validation.ts';
import { PUBLIC_JSON_SCHEMAS } from '../../../../infrastructure/contracts/public-json.ts';
import { createGitCommitReader, TASK_COMMIT_LIMITS, type CommitLimits } from '../../commits/infrastructure/git-commit-reader.ts';
import { resolveTaskRepositoryScope, type TaskRepositoryScopeDependencies } from '../../commits/application/task-repository-scope.ts';
import { createGitChangesReader, TASK_CHANGED_FILE_LIMITS, type ChangedFileLimits } from '../infrastructure/git-changes-reader.ts';
import type { TaskChangedFile } from '../domain/task-changed-file.ts';
import { createTaskCommitsApplication } from '../../commits/application/task-commits-application.ts';

export type TaskChangedFilesDependencies = TaskRepositoryScopeDependencies;

type RepositoryOutput = TaskChangedFilesResult['repositories'][number];

/** Read worktree changes and per-commit file lists for a task's real Git scope. */
export function createTaskChangedFilesApplication(dependencies: TaskChangedFilesDependencies, commitLimits: CommitLimits = TASK_COMMIT_LIMITS, fileLimits: ChangedFileLimits = TASK_CHANGED_FILE_LIMITS) {
  const commitsApplication = createTaskCommitsApplication(dependencies, commitLimits);
  function inspectTaskChangedFiles(targetRoot: string, taskIdValue: string): TaskChangedFilesResult {
    const taskId = taskActionId(taskIdValue, 'taskId');
    const scope = resolveTaskRepositoryScope(targetRoot, taskId, dependencies, commitLimits);
    const reader = createGitChangesReader(fileLimits);
    const commitsResult = commitsApplication.inspectTaskCommits(targetRoot, taskId);
    const diagnostics: TaskChangedFilesResult['diagnostics'] = [...scope.diagnostics];
    const report = (code: string, message: string, repositoryId: string | null = null, hash: string | null = null) => diagnostics.push({ code, message, reference: null, repositoryId, hash });
    const files: TaskChangedFile[] = [];
    const repositories: RepositoryOutput[] = [];
    let truncated = scope.truncated;
    for (const view of scope.repositories) {
      const current = scope.reads.get(view.id);
      repositories.push({
        id: view.id, label: view.label, root: view.root, sources: view.sources,
        status: view.status, branch: null, ahead: null, fileCount: 0, scannedCommitCount: view.scannedCommitCount,
      });
      if (!current) continue;
      const output = repositories.at(-1)!;
      const seen = new Set<string>();
      let fileCount = 0;
      const ordered = [...current.taskCheckouts, ...[...current.checkouts].filter(item => !current.taskCheckouts.has(item))];
      for (const checkout of ordered) {
        try {
          const status = reader.worktreeStatus(checkout, current.repository);
          output.branch ||= status.branch;
          output.ahead ??= status.upstreamAhead;
          for (const failure of status.failures) report(failure.code, failure.message, view.id);
          if (status.truncated) { output.status = 'truncated'; truncated = true; }
          for (const file of status.files) {
            if (seen.has(file.path)) continue;
            seen.add(file.path); files.push(file); fileCount += 1;
          }
        } catch {
          output.status = 'unavailable';
          report('task_changed_files_unavailable', '该代码库的一个检出位置工作区状态读取失败；其他结果仍保留。', view.id);
        }
      }
      output.fileCount = fileCount;
    }
    const commits: TaskCommitsResult['commits'][number][] = commitsResult.commits;
    const commitFiles: TaskChangedFilesResult['commitFiles'] = {};
    for (const commit of commits.slice(0, fileLimits.commitFileLimit)) {
      const current = scope.reads.get(commit.repositoryId);
      if (!current) continue;
      try {
        const result = reader.commitFiles(current.repository, commit.hash, commit.repositoryId);
        for (const failure of result.failures) report(failure.code, failure.message, commit.repositoryId, commit.hash);
        if (result.truncated) truncated = true;
        const key = `${encodeURIComponent(commit.repositoryId)}:${commit.hash}`;
        if (result.files.length) commitFiles[key] = result.files;
      } catch {
        report('task_changed_files_commit_unavailable', '该提交的文件改动读取失败；提交本身仍保留在列表中。', commit.repositoryId, commit.hash);
      }
    }
    const repositoryMeta = Object.fromEntries(repositories.map(repository => [repository.id, { branch: repository.branch, ahead: repository.ahead }]));
    return {
      schemaVersion: PUBLIC_JSON_SCHEMAS.taskChangedFiles, taskId, readAt: new Date().toISOString(),
      status: diagnostics.length || truncated ? 'partial' : 'complete',
      files: files.slice(0, fileLimits.fileLimit),
      repositories,
      commits,
      commitFiles,
      repositoryMeta,
      coverage: {
        repositoryLimit: commitLimits.repositoryLimit, fileLimit: fileLimits.fileLimit,
        commitFileLimit: fileLimits.commitFileLimit, previewLineLimit: fileLimits.previewLineLimit, truncated,
      },
      diagnostics, effects: [],
    };
  }
  return Object.freeze({ inspectTaskChangedFiles });
}
