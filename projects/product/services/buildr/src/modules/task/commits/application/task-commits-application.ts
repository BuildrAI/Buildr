import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { TaskCommitsResult } from '../../../../../build/generated/task-dto.ts';
import type { TaskRecord } from '../../application/task-dto.ts';
import { isWorkspaceOnlyTaskRecord, taskActionId } from '../../application/task-validation.ts';
import { PUBLIC_JSON_SCHEMAS } from '../../../../infrastructure/contracts/public-json.ts';
import { parseTaskCommitTrailer } from '../domain/task-commit.ts';
import { createGitCommitReader, TASK_COMMIT_LIMITS, type CommitLimits, type GitRepository } from '../infrastructure/git-commit-reader.ts';

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
type RepositoryView = TaskCommitsResult['repositories'][number];
type RepositoryRead = { repository: GitRepository; view: RepositoryView; heads: Set<string> };
const inside = (parent: string, child: string) => { const relative = path.relative(parent, child); return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)); };

export function createTaskCommitsApplication(dependencies: TaskCommitsDependencies, limits: CommitLimits = TASK_COMMIT_LIMITS) {
  function inspectTaskCommits(targetRoot: string, taskIdValue: string): TaskCommitsResult {
    const taskId = taskActionId(taskIdValue, 'taskId');
    const task = dependencies.readTask(targetRoot, taskId);
    const root = fs.realpathSync(task.root);
    const reader = createGitCommitReader(limits);
    const repositories: RepositoryView[] = [];
    const reads = new Map<string, RepositoryRead>();
    const diagnostics: TaskCommitsResult['diagnostics'] = [];
    const commits: TaskCommitsResult['commits'] = [];
    const refs: string[] = [];
    let truncated = false;
    const report = (code: string, message: string, reference: string | null = null, repositoryId: string | null = null, hash: string | null = null) => diagnostics.push({ code, message, reference, repositoryId, hash });
    const failureCode = (error: unknown) => error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'task_commits_repository_unavailable';
    function observeHead(root: string, current: RepositoryRead, reference: string) {
      try { const head = reader.head(root); if (head) current.heads.add(head); }
      catch (error) { report(failureCode(error), '该来源的 HEAD 不可读；继续读取其他有效引用。', reference, current.repository.id); }
    }
    function add(location: string, reference: string, attached = false): RepositoryRead | null {
      try {
        const real = fs.realpathSync(location);
        if (!attached && !inside(root, real)) throw Object.assign(new Error('来源越出已登记工作空间。'), { code: 'task_commits_scope_forbidden' });
        const repository = reader.repository(real);
        if (!inside(repository.root, real) || (!attached && !inside(root, repository.root))) throw Object.assign(new Error('Git 根目录越出任务来源范围。'), { code: 'task_commits_scope_forbidden' });
        const existing = reads.get(repository.id);
        if (existing) {
          if (!existing.view.sources.includes(reference)) existing.view.sources.push(reference);
          observeHead(repository.root, existing, reference);
          return existing;
        }
        if (reads.size >= limits.repositoryLimit) { truncated = true; report('task_commits_repository_limit', `最多读取 ${limits.repositoryLimit} 个真实代码库；此来源尚未读取。`, reference); return null; }
        const view: RepositoryView = { id: repository.id, root: repository.root, label: path.basename(repository.root), sources: [reference], status: 'complete', scannedCommitCount: 0 };
        const current = { repository, view, heads: new Set<string>() };
        repositories.push(view); reads.set(repository.id, current);
        observeHead(repository.root, current, reference);
        return current;
      } catch (error) {
        const id = `sha256-${crypto.createHash('sha256').update(`unavailable\0${location}`).digest('hex')}`;
        const existing = repositories.find(item => item.id === id);
        if (existing) existing.sources.push(reference);
        else repositories.push({ id, root: location, label: path.basename(location), sources: [reference], status: 'unavailable', scannedCommitCount: 0 });
        report(failureCode(error), '该任务来源的 Git 代码库当前不可读。', reference, id);
        return null;
      }
    }
    const projects = [...new Set([...task.record.scope.projects, ...task.record.scope.services.map(item => item.project), ...task.record.changes.map(item => item.project)])].sort();
    const sourcePaths = new Map<string, string>();
    if (projects.length) {
      let registered: ReturnType<TaskCommitsDependencies['readProjectRegistryRecord']> | null = null;
      try {
        registered = dependencies.readProjectRegistryRecord(root);
        if (registered.registry.migrationRequired) throw new Error('Project registry migration required.');
      } catch { report('task_commits_project_registry_unavailable', '任务项目登记当前不可读；其他已知来源仍继续读取。'); }
      for (const code of projects) {
        const project = registered?.projects[code];
        if (project) {
          try {
            const location = dependencies.resolveSourceRoot(root, project.source);
            sourcePaths.set(`project:${code}`, location);
            add(location, `project:${code}`, project.source.root === 'attached');
          } catch { report('task_commits_project_unavailable', '任务项目来源当前不可读。', `project:${code}`); }
        } else if (registered) report('task_commits_project_unavailable', '任务项目不在当前登记中。', `project:${code}`);
        const requested = task.record.scope.services.filter(item => item.project === code);
        if (!requested.length) continue;
        try {
          const services = dependencies.readServiceRegistryRecord(root, code).services;
          for (const item of requested) {
            const reference = `service:${code}/${item.service}`;
            try {
              const service = services[item.service];
              if (!service) { report('task_commits_service_unavailable', '任务服务不在当前登记中。', reference); continue; }
              const source = service.repositorySource || service.source;
              const location = dependencies.resolveSourceRoot(root, source);
              sourcePaths.set(reference, location);
              add(location, reference, source.root === 'attached');
            } catch { report('task_commits_service_unavailable', '任务服务来源当前不可读。', reference); }
          }
        } catch { report('task_commits_service_registry_unavailable', '任务服务登记当前不可读。', `project:${code}`); }
      }
    }
    // The provider owns task worktree evidence. Do not search directory names or other tasks.
    let workspaceRepository: GitRepository | null = null;
    try { const value = reader.repository(root); if (value.root === root) workspaceRepository = value; }
    catch (error) {
      // No Git metadata is a valid local workspace. Existing metadata with an unreadable Git probe is not a confirmed empty result.
      if (fs.lstatSync(path.join(root, '.git'), { throwIfNoEntry: false })) report(failureCode(error), '工作空间 Git 来源当前不可读，尚未确认该范围的提交。', 'workspace');
    }
    if (workspaceRepository) {
      if (isWorkspaceOnlyTaskRecord(task.record)) add(root, 'workspace');
      try {
        const evidence = dependencies.readGitWorktreeEvidence(root, taskId, { optional: true });
        for (const worktree of evidence?.evidence.repositories || []) {
          const location = worktree.selector === 'workspace' ? root : sourcePaths.get(worktree.selector);
          if (!location) { report('task_commits_worktree_outside_scope', '登记工作树不在当前任务项目或服务范围内。', worktree.selector); continue; }
          try {
            const source = reader.repository(location);
            const recordedSource = reader.repository(worktree.sourceRepository);
            if (source.id !== recordedSource.id) throw new Error('Worktree source identity differs.');
            const current = reads.get(source.id) || add(location, worktree.selector, !inside(root, location));
            if (!current) continue;
            const checkout = reader.repository(worktree.checkoutPath);
            if (checkout.id !== source.id || !reader.registeredWorktree(source.root, worktree.checkoutPath)) throw new Error('Worktree identity or registration differs.');
            const head = reader.head(worktree.checkoutPath);
            if (head) current.heads.add(head);
            current.view.sources.push(`task-worktree:${worktree.checkoutPath}`);
          } catch { report('task_commits_worktree_unavailable', '任务工作树当前不可读或不再属于登记代码库；保留其他可读引用。', worktree.selector); }
        }
      } catch { report('task_commits_worktree_evidence_unavailable', '当前任务工作树登记不可读；保留项目与服务范围的读取结果。'); }
    }
    for (const current of reads.values()) {
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
      status: diagnostics.length || truncated ? 'partial' : 'complete', commits: commits.slice(0, limits.commitLimit), repositories,
      coverage: { refs, repositoryLimit: limits.repositoryLimit, historyLimitPerRepository: limits.historyLimitPerRepository, commitLimit: limits.commitLimit, truncated },
      diagnostics, effects: [],
    };
  }
  return Object.freeze({ inspectTaskCommits });
}
