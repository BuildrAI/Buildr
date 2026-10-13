import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { observeGitRepositoryRoot } from '../../../../infrastructure/git/repository-boundary.ts';
import type { TaskRecord } from '../../application/task-dto.ts';
import { isWorkspaceOnlyTaskRecord } from '../../application/task-validation.ts';
import { insideFilesystemPath, sameFilesystemPath } from '../../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { createGitCommitReader, TASK_COMMIT_LIMITS, type CommitLimits, type GitRepository } from '../infrastructure/git-commit-reader.ts';

type Source = { path: string; root?: string; type?: string };
type Entity = { source: Source; repositorySource?: Source };
type Worktree = { selector: string; sourceRepository: string; checkoutPath: string };
export const TASK_COMMIT_TASK_LIMIT = 100;
export type TaskCommitTarget = Pick<TaskRecord, 'taskId' | 'scope' | 'changes'> & { title?: string };
export type TaskCommitTargets = { root: string; records: TaskCommitTarget[]; includesChildren: boolean; truncated: boolean };
export type TaskRepositoryScopeDependencies = {
  readTask(root: string, taskId: string): { root: string; record: TaskCommitTarget };
  readTaskCommitTargets?(root: string, taskId: string, limit: number): TaskCommitTargets;
  readProjectRegistryRecord(root: string): { registry: { migrationRequired: boolean }; projects: Record<string, Entity> };
  readServiceRegistryRecord(root: string, project: string): { services: Record<string, Entity> };
  resolveSourceRoot(root: string, source: Source): string;
  readGitWorktreeEvidence(root: string, taskId: string, options: { optional: boolean }): { evidence: { repositories: Worktree[] } } | null;
};
export type TaskRepositoryView = { id: string; root: string; label: string; sources: string[]; status: 'complete' | 'unavailable' | 'truncated'; scannedCommitCount: number };
export type TaskScopeRepository = { repository: GitRepository; view: TaskRepositoryView; heads: Set<string>; checkouts: Set<string>; taskCheckouts: Set<string> };
export type TaskRepositoryScope = {
  targetRoot: string;
  repositories: TaskRepositoryView[];
  reads: Map<string, TaskScopeRepository>;
  diagnostics: { code: string; message: string; reference: string | null; repositoryId: string | null; hash: string | null }[];
  truncated: boolean;
  taskTargets: Map<string, TaskCommitTarget>;
  repositoryTaskIds: Map<string, Set<string>>;
  includesChildren: boolean;
};

export function resolveTaskCommitRepositoryScope(targetRoot: string, taskId: string, dependencies: TaskRepositoryScopeDependencies, limits: CommitLimits = TASK_COMMIT_LIMITS): TaskRepositoryScope {
  const targets = dependencies.readTaskCommitTargets?.(targetRoot, taskId, TASK_COMMIT_TASK_LIMIT);
  return resolveTaskRepositoryScope(targetRoot, taskId, dependencies, limits, { targets });
}

/** Resolve the task's real Git repositories: declared project/service sources plus the task's own worktrees. */
export function resolveTaskRepositoryScope(targetRoot: string, taskId: string, dependencies: TaskRepositoryScopeDependencies, limits: CommitLimits = TASK_COMMIT_LIMITS, options: { observeHeads?: boolean; targets?: TaskCommitTargets } = {}): TaskRepositoryScope {
  const task = options.targets ? null : dependencies.readTask(targetRoot, taskId);
  const targets = options.targets || { root: task!.root, records: [task!.record], includesChildren: false, truncated: false };
  const root = fs.realpathSync(targets.root);
  const reader = createGitCommitReader(limits);
  const repositories: TaskRepositoryView[] = [];
  const reads = new Map<string, TaskScopeRepository>();
  const diagnostics: TaskRepositoryScope['diagnostics'] = [];
  const taskTargets = new Map(targets.records.map(record => [record.taskId, record]));
  const repositoryTaskIds = new Map<string, Set<string>>();
  let ownerTaskId = taskId;
  let truncated = targets.truncated;
  const report = (code: string, message: string, reference: string | null = null, repositoryId: string | null = null, hash: string | null = null) => diagnostics.push({ code, message, reference, repositoryId, hash });
  const failureCode = (error: unknown) => error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'task_commits_repository_unavailable';
  if (targets.truncated) report('task_commits_task_limit', `最多读取自身及 ${TASK_COMMIT_TASK_LIMIT - 1} 个直接子任务；其他子任务尚未读取。`, taskId);
  function associate(repositoryId: string) {
    const owners = repositoryTaskIds.get(repositoryId) || new Set<string>();
    owners.add(ownerTaskId); repositoryTaskIds.set(repositoryId, owners);
  }
  function observeHead(location: string, current: TaskScopeRepository, reference: string) {
    if (options.observeHeads === false) return;
    try { const head = reader.head(location); if (head) current.heads.add(head); }
    catch (error) { report(failureCode(error), '该来源的 HEAD 不可读；继续读取其他有效引用。', reference, current.repository.id); }
  }
  function add(location: string, reference: string, attached = false, source?: Source): TaskScopeRepository | null {
    try {
      const real = fs.realpathSync(location);
      if (!attached && !insideFilesystemPath(root, real)) throw Object.assign(new Error('来源越出已登记工作空间。'), { code: 'task_commits_scope_forbidden' });
      let repository: GitRepository;
      try { repository = reader.repository(real); }
      catch (error) {
        if (source?.type !== 'git' && observeGitRepositoryRoot(real) === null) return null;
        throw error;
      }
      if (!insideFilesystemPath(repository.root, real) || (!attached && !insideFilesystemPath(root, repository.root))) throw Object.assign(new Error('Git 根目录越出任务来源范围。'), { code: 'task_commits_scope_forbidden' });
      const existing = reads.get(repository.id);
      if (existing) {
        associate(repository.id);
        if (!existing.view.sources.includes(reference)) existing.view.sources.push(reference);
        if (!existing.checkouts.has(repository.root)) {
          existing.checkouts.add(repository.root);
          observeHead(repository.root, existing, reference);
        }
        return existing;
      }
      if (reads.size >= limits.repositoryLimit) { truncated = true; report('task_commits_repository_limit', `最多读取 ${limits.repositoryLimit} 个真实代码库；此来源尚未读取。`, reference); return null; }
      const view: TaskRepositoryView = { id: repository.id, root: repository.root, label: path.basename(repository.root), sources: [reference], status: 'complete', scannedCommitCount: 0 };
      const current = { repository, view, heads: new Set<string>(), checkouts: new Set<string>([repository.root]), taskCheckouts: new Set<string>() };
      repositories.push(view); reads.set(repository.id, current);
      associate(repository.id);
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
  let registered: ReturnType<TaskRepositoryScopeDependencies['readProjectRegistryRecord']> | null | undefined;
  const serviceRegistries = new Map<string, ReturnType<TaskRepositoryScopeDependencies['readServiceRegistryRecord']>>();
  for (const record of taskTargets.values()) {
    ownerTaskId = record.taskId;
    const projects = [...new Set([...record.scope.projects, ...record.scope.services.map(item => item.project), ...record.changes.map(item => item.project)])].sort();
    const sourcePaths = new Map<string, string>();
    if (projects.length) {
      if (registered === undefined) {
        try {
          registered = dependencies.readProjectRegistryRecord(root);
          if (registered.registry.migrationRequired) throw new Error('Project registry migration required.');
        } catch { registered = null; report('task_commits_project_registry_unavailable', '任务项目登记当前不可读；其他已知来源仍继续读取。'); }
      }
      for (const code of projects) {
        const project = registered?.projects[code];
        if (project) {
          try {
            const location = dependencies.resolveSourceRoot(root, project.source);
            sourcePaths.set(`project:${code}`, location);
            add(location, `project:${code}`, project.source.root === 'attached', project.source);
          } catch { report('task_commits_project_unavailable', '任务项目来源当前不可读。', `project:${code}`); }
        } else if (registered) report('task_commits_project_unavailable', '任务项目不在当前登记中。', `project:${code}`);
        const requested = record.scope.services.filter(item => item.project === code);
        if (!requested.length) continue;
        try {
          let serviceRegistry = serviceRegistries.get(code);
          if (!serviceRegistry) { serviceRegistry = dependencies.readServiceRegistryRecord(root, code); serviceRegistries.set(code, serviceRegistry); }
          const services = serviceRegistry.services;
          for (const item of requested) {
            const reference = `service:${code}/${item.service}`;
            try {
              const service = services[item.service];
              if (!service) { report('task_commits_service_unavailable', '任务服务不在当前登记中。', reference); continue; }
              const source = service.repositorySource || service.source;
              const location = dependencies.resolveSourceRoot(root, source);
              sourcePaths.set(reference, location);
              add(location, reference, source.root === 'attached', source);
            } catch { report('task_commits_service_unavailable', '任务服务来源当前不可读。', reference); }
          }
        } catch { report('task_commits_service_registry_unavailable', '任务服务登记当前不可读。', `project:${code}`); }
      }
    }
    // The provider owns task worktree evidence. Do not search directory names or other tasks.
    let workspaceRepository: GitRepository | null = null;
    try { const value = reader.repository(root); if (sameFilesystemPath(value.root, root)) workspaceRepository = value; }
    catch (error) {
      // No Git metadata is a valid local workspace. Existing metadata with an unreadable Git probe is not a confirmed empty result.
      if (fs.lstatSync(path.join(root, '.git'), { throwIfNoEntry: false })) report(failureCode(error), '工作空间 Git 来源当前不可读，尚未确认该范围的提交。', 'workspace');
    }
    if (workspaceRepository && isWorkspaceOnlyTaskRecord(record)) add(root, 'workspace');
    try {
      const evidence = dependencies.readGitWorktreeEvidence(root, record.taskId, { optional: true });
      for (const worktree of evidence?.evidence.repositories || []) {
        const location = worktree.selector === 'workspace' ? root : sourcePaths.get(worktree.selector);
        if (!location) { report('task_commits_worktree_outside_scope', '登记工作树不在当前任务项目或服务范围内。', worktree.selector); continue; }
        try {
          const source = reader.repository(location);
          const recordedSource = reader.repository(worktree.sourceRepository);
          if (source.id !== recordedSource.id) throw new Error('Worktree source identity differs.');
          const current = reads.get(source.id) || add(location, worktree.selector, !insideFilesystemPath(root, location));
          if (!current) continue;
          associate(source.id);
          const checkout = reader.repository(worktree.checkoutPath);
          if (checkout.id !== source.id || !reader.registeredWorktree(source.root, worktree.checkoutPath)) throw new Error('Worktree identity or registration differs.');
          if (!current.checkouts.has(worktree.checkoutPath)) current.checkouts.add(worktree.checkoutPath);
          current.taskCheckouts.add(worktree.checkoutPath);
          if (options.observeHeads !== false) {
            const head = reader.head(worktree.checkoutPath);
            if (head) current.heads.add(head);
          }
          if (!current.view.sources.includes(`task-worktree:${worktree.checkoutPath}`)) current.view.sources.push(`task-worktree:${worktree.checkoutPath}`);
        } catch { report('task_commits_worktree_unavailable', '任务工作树当前不可读或不再属于登记代码库；保留其他可读引用。', worktree.selector); }
      }
    } catch { report('task_commits_worktree_evidence_unavailable', '当前任务工作树登记不可读；保留项目与服务范围的读取结果。'); }
  }
  return { targetRoot: root, repositories, reads, diagnostics, truncated, taskTargets, repositoryTaskIds, includesChildren: targets.includesChildren };
}
