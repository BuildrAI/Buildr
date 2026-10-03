import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { observeGitCheckoutReadIdentity } from '../../../infrastructure/git/checkout-read-identity.ts';
import { CODE_LIMITS, codeGit, gitCommonDirectory } from './code-file-reader.ts';

export type CodeWorktreeKind = 'main' | 'task' | 'worktree';
export type CodeWorktree = { id: string; repositoryId: string; groupId: string; path: string; branch: string | null; kind: CodeWorktreeKind; taskId: string | null; available: boolean };
export type CodeWorktreeGroup = { id: string; name: string; kind: CodeWorktreeKind; taskId: string | null; repositoryIds: string[] };
type Diagnostic = { code: string; message: string; repositoryId: string | null };
type Repository = { id: string; name: string; location: string; available: boolean };
export type WorktreeCatalogDependencies = {
  gitWorktreeEvidencePath?(root: string, taskId: string): string;
  readGitWorktreeEvidence(root: string, taskId: string, options: { optional: boolean }): { evidence: { repositories: Array<{ sourceRepository: string; checkoutPath: string }> } } | null;
};

function listedWorktrees(location: string) {
  const entries: Array<{ path: string; branch: string | null }> = [];
  for (const field of codeGit(location, ['worktree', 'list', '--porcelain', '-z'], 2 * 1024 * 1024).toString().split('\0')) {
    if (field.startsWith('worktree ')) entries.push({ path: field.slice(9), branch: null });
    else if (field.startsWith('branch ') && entries.length) entries.at(-1)!.branch = field.slice(7).replace(/^refs\/heads\//, '');
  }
  return entries;
}

// Missing leaves still retain the canonical spelling of their existing ancestors (e.g. /var -> /private/var).
function canonicalCheckoutPath(value: string) {
  let ancestor = path.resolve(value); const suffix: string[] = [];
  while (true) {
    try { return path.join(fs.realpathSync(ancestor), ...suffix); } catch { /* walk to the nearest existing parent */ }
    const parent = path.dirname(ancestor); if (parent === ancestor) return path.resolve(value);
    suffix.unshift(path.basename(ancestor)); ancestor = parent;
  }
}

/** Git owns membership; provider evidence only supplies the actual task association. */
export function readCodeWorktreeCatalog(root: string, repositories: Repository[], dependencies: WorktreeCatalogDependencies, taskId?: string) {
  const diagnostics: Diagnostic[] = [], worktrees: CodeWorktree[] = [];
  const deadline = Date.now() + CODE_LIMITS.readMs;
  const groups = new Map<string, CodeWorktreeGroup>();
  const commonDirectories = new Map<string, string>();
  const addGroup = (id: string, name: string, kind: CodeWorktreeKind, task: string | null, repositoryId: string) => {
    let group = groups.get(id);
    if (!group) { group = { id, name, kind, taskId: task, repositoryIds: [] }; groups.set(id, group); }
    if (!group.repositoryIds.includes(repositoryId)) group.repositoryIds.push(repositoryId);
  };
  for (const repository of repositories) {
    if (Date.now() >= deadline) { diagnostics.push({ code: 'code_worktrees_truncated', message: '目录发现达到本次时间上限，保留已确认的目录。', repositoryId: null }); break; }
    if (!repository.available) continue;
    try {
      const common = gitCommonDirectory(repository.location); commonDirectories.set(repository.id, common);
      const listed = listedWorktrees(repository.location);
      if (listed.length > 1000) diagnostics.push({ code: 'code_worktrees_truncated', message: repository.name + ' 的目录数量达到读取上限，保留前 1000 个目录。', repositoryId: repository.id });
      for (const entry of listed.slice(0, 1000)) {
        if (Date.now() >= deadline) { diagnostics.push({ code: 'code_worktrees_truncated', message: repository.name + ' 的目录发现达到本次时间上限。', repositoryId: repository.id }); break; }
        let identity;
        try { identity = observeGitCheckoutReadIdentity(entry.path); } catch {
          diagnostics.push({ code: 'code_worktree_unavailable', message: '一个 Git 登记目录当前不可读取：' + entry.path, repositoryId: repository.id }); continue;
        }
        if (!sameFilesystemPath(identity.commonDirectory, common) || !sameFilesystemPath(identity.root, entry.path)) {
          diagnostics.push({ code: 'code_worktree_identity_changed', message: '一个 Git 登记目录的身份已变化：' + entry.path, repositoryId: repository.id }); continue;
        }
        const main = sameFilesystemPath(identity.root, repository.location);
        const groupId = main ? 'main' : 'worktree:' + identity.id;
        const member: CodeWorktree = { id: identity.id, repositoryId: repository.id, groupId, path: identity.root, branch: entry.branch, kind: main ? 'main' : 'worktree', taskId: null, available: true };
        worktrees.push(member);
      }
    } catch { diagnostics.push({ code: 'code_worktrees_unavailable', message: repository.name + ' 的 Git 目录列表当前不可读取，保留其他代码库。', repositoryId: repository.id }); }
  }
  const taskIds = new Set(taskId ? [taskId] : []);
  if (dependencies.gitWorktreeEvidencePath) {
    try {
      // The provider selects its metadata directory; each discovered record is still validated by the provider.
      const directory = path.dirname(dependencies.gitWorktreeEvidencePath(root, 'code-worktree-list'));
      if (fs.existsSync(directory)) {
        const handle = fs.opendirSync(directory), files: string[] = [];
        try { let entry: fs.Dirent | null; while ((entry = handle.readSync())) { if (/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\.json$/.test(entry.name)) files.push(entry.name); if (files.length > 1000 || Date.now() >= deadline) break; } } finally { handle.closeSync(); }
        if (files.length > 1000 || Date.now() >= deadline) diagnostics.push({ code: 'code_worktree_associations_truncated', message: '任务目录关联达到读取上限，部分目录保留为独立选项。', repositoryId: null });
        for (const file of files.sort().slice(0, 1000)) taskIds.add(file.slice(0, -5));
      }
    } catch { diagnostics.push({ code: 'code_worktree_associations_unavailable', message: '任务目录关联当前不可读取，保留 Git 可确定的目录。', repositoryId: null }); }
  }
  let requestedTaskHasEvidence = false;
  const associations = new Map<CodeWorktree, Set<string>>();
  for (const id of taskIds) {
    if (Date.now() >= deadline) { requestedTaskHasEvidence ||= Boolean(taskId); diagnostics.push({ code: 'code_worktree_associations_truncated', message: '任务目录关联达到本次时间上限，不能确定的任务范围不回退到主目录。', repositoryId: null }); break; }
    let evidence;
    try { evidence = dependencies.readGitWorktreeEvidence(root, id, { optional: true }); } catch {
      diagnostics.push({ code: 'code_worktree_evidence_unavailable', message: '任务 ' + id + ' 的目录关联当前不可读取。', repositoryId: null });
      if (id === taskId) requestedTaskHasEvidence = true;
      continue;
    }
    if (!evidence) continue;
    if (id === taskId) requestedTaskHasEvidence = true;
    for (const recorded of evidence.evidence.repositories) {
      if (Date.now() >= deadline) { diagnostics.push({ code: 'code_worktree_associations_truncated', message: '任务 ' + id + ' 的目录关联达到本次时间上限，保留已确认的成员。', repositoryId: null }); break; }
      let common: string;
      try { common = gitCommonDirectory(recorded.sourceRepository); } catch {
        diagnostics.push({ code: 'code_worktree_source_unavailable', message: '任务 ' + id + ' 的一个代码库来源当前不可读取。', repositoryId: null }); continue;
      }
      for (const repository of repositories) {
        const registeredCommon = commonDirectories.get(repository.id);
        if (!registeredCommon || !sameFilesystemPath(common, registeredCommon)) continue;
        const member = worktrees.find(item => item.repositoryId === repository.id && sameFilesystemPath(item.path, recorded.checkoutPath));
        if (member) {
          if (member.kind === 'main') continue;
          let tasks = associations.get(member); if (!tasks) { tasks = new Set(); associations.set(member, tasks); } tasks.add(id);
        } else {
          const unavailablePath = canonicalCheckoutPath(recorded.checkoutPath);
          const unavailableId = 'checkout-' + crypto.createHash('sha256').update(JSON.stringify({ unavailable: true, common, path: unavailablePath })).digest('hex');
          if (!worktrees.some(item => item.repositoryId === repository.id && item.id === unavailableId && item.taskId === id)) worktrees.push({ id: unavailableId, repositoryId: repository.id, groupId: 'task:' + id, path: unavailablePath, branch: null, kind: 'task', taskId: id, available: false });
          diagnostics.push({ code: 'code_task_location_unavailable', message: '任务 ' + id + ' 的目录已不存在或不再属于登记代码库：' + unavailablePath, repositoryId: repository.id });
        }
      }
    }
  }
  for (const [member, tasks] of associations) {
    if (tasks.size === 1) { const id = [...tasks][0]; member.groupId = 'task:' + id; member.kind = 'task'; member.taskId = id; }
    else diagnostics.push({ code: 'code_worktree_task_ambiguous', message: '一个目录被多个任务关联，保留独立目录选项并请核对关联。', repositoryId: member.repositoryId });
  }
  for (const member of worktrees) {
    const name = member.kind === 'main' ? '主目录' : member.kind === 'task' ? member.taskId! : (member.branch || '分离版本') + ' · ' + path.basename(path.dirname(member.path)) + '/' + path.basename(member.path);
    addGroup(member.groupId, name, member.kind, member.taskId, member.repositoryId);
  }
  const names = new Map<string, CodeWorktreeGroup[]>();
  for (const group of groups.values()) if (group.kind === 'worktree') { const matching = names.get(group.name) || []; matching.push(group); names.set(group.name, matching); }
  for (const matching of names.values()) if (matching.length > 1) for (const group of matching) { const member = worktrees.find(item => item.groupId === group.id)!; group.name = (member.branch || '分离版本') + ' · ' + member.path; }
  if (taskId && requestedTaskHasEvidence && !groups.has('task:' + taskId)) groups.set('task:' + taskId, { id: 'task:' + taskId, name: taskId, kind: 'task', taskId, repositoryIds: [] });
  const worktreeGroups = [...groups.values()].sort((a, b) => Number(b.id === 'main') - Number(a.id === 'main') || a.name.localeCompare(b.name));
  return { worktrees, worktreeGroups, selectedWorktreeGroupIds: taskId && requestedTaskHasEvidence ? ['task:' + taskId] : ['main'], diagnostics };
}
