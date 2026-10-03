import type { TaskChangedFilesResult, TaskChangedFileCountResponse, TaskCommitsResult } from '../../../../../build/generated/task-dto.ts';
import { taskActionId } from '../../application/task-validation.ts';
import { PUBLIC_JSON_SCHEMAS } from '../../../../infrastructure/contracts/public-json.ts';
import { createGitCommitReader, TASK_COMMIT_LIMITS, type CommitLimits } from '../../commits/infrastructure/git-commit-reader.ts';
import { resolveTaskRepositoryScope, type TaskRepositoryScopeDependencies } from '../../commits/application/task-repository-scope.ts';
import { createGitChangesReader, TASK_CHANGED_FILE_LIMITS, type ChangedFileLimits } from '../infrastructure/git-changes-reader.ts';
import path from 'node:path';
import type { TaskChangedFile } from '../domain/task-changed-file.ts';
import { readTaskCommits } from '../../commits/application/task-commits-application.ts';
import { gitCheckoutReadId } from '../../../../infrastructure/git/checkout-read-identity.ts';

export type TaskChangedFilesDependencies = TaskRepositoryScopeDependencies;

type RepositoryOutput = TaskChangedFilesResult['repositories'][number];

function assertObservedCheckout(checkout: string, checkoutId: string) {
  let currentId: string | null = null;
  try { currentId = gitCheckoutReadId(checkout); } catch { /* A removed source cannot supply the observed contents. */ }
  if (currentId !== checkoutId) throw Object.assign(new Error('所选检出来源已失效或身份已变化，请刷新列表。'), { code: 'task_file_checkout_unavailable', status: 404 });
}

/** Read worktree changes and per-commit file lists for a task's real Git scope. */
export function createTaskChangedFilesApplication(dependencies: TaskChangedFilesDependencies, commitLimits: CommitLimits = TASK_COMMIT_LIMITS, fileLimits: ChangedFileLimits = TASK_CHANGED_FILE_LIMITS) {
  function inspectTaskChangedFileCount(targetRoot: string, taskIdValue: string): TaskChangedFileCountResponse {
    const taskId = taskActionId(taskIdValue, 'taskId');
    const scope = resolveTaskRepositoryScope(targetRoot, taskId, dependencies, commitLimits, { observeHeads: false });
    const reader = createGitChangesReader(fileLimits);
    const diagnostics = [...scope.diagnostics];
    let fileCount = 0, truncated = scope.truncated;
    for (const current of scope.reads.values()) {
      const paths = new Set<string>();
      const ordered = [...current.taskCheckouts, ...[...current.checkouts].filter(item => !current.taskCheckouts.has(item))];
      for (const checkout of ordered) {
        try {
          const status = reader.worktreeStatus(checkout, current.repository, { metadataOnly: true });
          truncated ||= status.truncated;
          for (const failure of status.failures) diagnostics.push({ ...failure, reference: null, repositoryId: current.repository.id, hash: null });
          for (const file of status.files) paths.add(file.path);
        } catch {
          diagnostics.push({ code: 'task_changed_files_unavailable', message: '该代码库的工作区状态读取失败；保留其他结果。', reference: null, repositoryId: current.repository.id, hash: null });
        }
      }
      fileCount += paths.size;
    }
    truncated ||= fileCount > fileLimits.fileLimit;
    return {
      schemaVersion: 'buildr.task-changed-file-count/v1', taskId, readAt: new Date().toISOString(),
      fileCount: Math.min(fileCount, fileLimits.fileLimit), status: diagnostics.length || truncated ? 'partial' : 'complete',
      coverage: { repositoryLimit: commitLimits.repositoryLimit, fileLimit: fileLimits.fileLimit, truncated }, diagnostics, effects: [],
    };
  }
  function inspectTaskChangedFiles(targetRoot: string, taskIdValue: string): TaskChangedFilesResult {
    const taskId = taskActionId(taskIdValue, 'taskId');
    const scope = resolveTaskRepositoryScope(targetRoot, taskId, dependencies, commitLimits);
    const reader = createGitChangesReader(fileLimits);
    const commitsResult = readTaskCommits(scope, taskId, commitLimits);
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
          const checkoutId = gitCheckoutReadId(checkout);
          const status = reader.worktreeStatus(checkout, current.repository);
          assertObservedCheckout(checkout, checkoutId);
          output.branch ||= status.branch;
          output.ahead ??= status.upstreamAhead;
          for (const failure of status.failures) report(failure.code, failure.message, view.id);
          if (status.truncated) { output.status = 'truncated'; truncated = true; }
          for (const file of status.files) {
            if (seen.has(file.path)) continue;
            seen.add(file.path); files.push({ ...file, checkoutId }); fileCount += 1;
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
  function inspectTaskFileDiff(targetRoot: string, taskIdValue: string, repositoryId: string, filePath: string, commitHash: string, checkoutId?: string): TaskChangedFilesResult {
    const taskId = taskActionId(taskIdValue, 'taskId');
    const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { code: 'task_file_diff_invalid', status }); };
    if (!filePath || filePath.includes('\\') || filePath.includes('\0') || path.posix.isAbsolute(filePath) || path.posix.normalize(filePath) !== filePath || filePath.split('/').includes('..')) fail('文件路径必须是代码库内的相对路径。');
    if (commitHash !== 'worktree' && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commitHash)) fail('提交身份无效。');
    if (checkoutId !== undefined && (typeof checkoutId !== 'string' || !/^checkout-[a-f0-9]{64}$/.test(checkoutId))) fail('检出来源身份无效。');
    const scope = resolveTaskRepositoryScope(targetRoot, taskId, dependencies, commitLimits);
    const current = scope.reads.get(repositoryId);
    if (!current) fail('代码库不在当前任务范围内。', 404);
    const reader = createGitChangesReader({ ...fileLimits, maxBytes: Math.min(fileLimits.maxBytes, 2 * 1024 * 1024) });
    const diagnostics = [...scope.diagnostics];
    const reportFailures = (failures: Array<{ code: string; message: string }>) => { for (const failure of failures) diagnostics.push({ ...failure, reference: null, repositoryId, hash: commitHash === 'worktree' ? null : commitHash }); };
    let files: TaskChangedFile[] = [], branch: string | null = null, ahead: number | null = null;
    if (commitHash === 'worktree') {
      const ordered = [...current!.taskCheckouts, ...[...current!.checkouts].filter(item => !current!.taskCheckouts.has(item))];
      let matchedCheckout = false;
      for (const checkout of ordered) {
        let observedCheckoutId: string;
        try { observedCheckoutId = gitCheckoutReadId(checkout); }
        catch (error) {
          // An explicit observation may no longer exist. Other checkouts cannot replace it.
          if (checkoutId) continue;
          throw error;
        }
        if (checkoutId && checkoutId !== observedCheckoutId) continue;
        matchedCheckout = true;
        const status = reader.worktreeStatus(checkout, current!.repository, { filePath, fullContext: true });
        assertObservedCheckout(checkout, observedCheckoutId);
        reportFailures(status.failures);
        const file = status.files.find(item => item.path === filePath);
        if (file) { files = [{ ...file, checkoutId: observedCheckoutId }]; branch = status.branch; ahead = status.upstreamAhead; break; }
        if (checkoutId) break;
      }
      if (checkoutId && !matchedCheckout) throw Object.assign(new Error('所选检出来源已失效或不在当前任务范围内，请刷新列表。'), { code: 'task_file_checkout_unavailable', status: 404 });
    } else {
      const commits = readTaskCommits(scope, taskId, commitLimits);
      if (!commits.commits.some(commit => commit.repositoryId === repositoryId && commit.hash === commitHash)) fail('提交不属于当前任务。', 404);
      const result = reader.commitFiles(current!.repository, commitHash, repositoryId, { filePath, fullContext: true });
      reportFailures(result.failures); files = result.files;
    }
    if (!files.length) fail('所选文件不在当前改动范围中，请刷新列表。', 404);
    const truncated = files.some(file => file.previewTruncated);
    return {
      schemaVersion: PUBLIC_JSON_SCHEMAS.taskChangedFiles, taskId, readAt: new Date().toISOString(), status: truncated || diagnostics.length ? 'partial' : 'complete',
      files, repositories: [{ ...current!.view, branch, ahead, fileCount: files.length }], commits: [], commitFiles: {}, repositoryMeta: { [repositoryId]: { branch, ahead } },
      coverage: { repositoryLimit: commitLimits.repositoryLimit, fileLimit: 1, commitFileLimit: 1, previewLineLimit: 5000, truncated }, diagnostics, effects: [],
    };
  }
  return Object.freeze({ inspectTaskChangedFiles, inspectTaskChangedFileCount, inspectTaskFileDiff });
}
