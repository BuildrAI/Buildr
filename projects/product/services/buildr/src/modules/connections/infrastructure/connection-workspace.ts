import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { connectionFailure, type ConnectionScope } from '../domain/connection.ts';

type WorkspaceReader = {
  getWorkspace(root: string): { rootPath: string; workspace: { id: string | null } };
  resolveSourceWorkspaceRoot(root: string): string | null;
  listRegisteredWorkspaces(): { workspaces: { rootPath: string; workspace?: { id: string | null } | null }[] };
};
function git(root: string, args: string[]): string | null {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env, timeout: 2000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return result.status === 0 ? result.stdout.trim() : null;
}
/** Resolve live canonical source, never a copied manifest in a linked code checkout. */
export function resolveConnectionWorkspace(target: string, workspace: WorkspaceReader): ConnectionScope {
  const source = workspace.resolveSourceWorkspaceRoot(path.resolve(target));
  if (!source) throw connectionFailure('connection_workspace_missing', '目标目录不属于可用的工作空间。', 409);
  const observed = workspace.getWorkspace(source), id = observed.workspace.id;
  if (!id) throw connectionFailure('connection_workspace_invalid', '工作空间缺少稳定编号，请先完成工作空间准备。', 409);
  const root = fs.realpathSync(observed.rootPath), gitRoot = git(root, ['rev-parse', '--show-toplevel']);
  if (!gitRoot) {
    for (let ancestor = root; ; ancestor = path.dirname(ancestor)) {
      if (fs.lstatSync(path.join(ancestor, '.git'), { throwIfNoEntry: false })) throw connectionFailure('connection_workspace_source_unavailable', '代码工作树来源已不可用；未使用旧连接副本。', 409);
      if (path.dirname(ancestor) === ancestor) break;
    }
  }
  let canonical = root;
  if (gitRoot) {
    const repositoryRoot = fs.realpathSync(gitRoot), relativeWorkspace = path.relative(repositoryRoot, root);
    const gitDir = git(root, ['rev-parse', '--git-dir']), common = git(root, ['rev-parse', '--git-common-dir']);
    if (!gitDir || !common) throw connectionFailure('connection_workspace_source_unavailable', '无法确认代码工作树的工作空间来源。', 409);
    if (fs.realpathSync(path.resolve(root, gitDir)) !== fs.realpathSync(path.resolve(root, common))) {
      const listed = git(root, ['worktree', 'list', '--porcelain', '-z']);
      const first = listed?.split('\0').find(part => part.startsWith('worktree '));
      if (!first) throw connectionFailure('connection_workspace_source_unavailable', '无法定位工作空间的规范来源。', 409);
      try { canonical = fs.realpathSync(path.join(first.slice(9), relativeWorkspace)); } catch { throw connectionFailure('connection_workspace_source_unavailable', '工作空间规范来源已不可用。', 409); }
      let current;
      try { current = workspace.getWorkspace(canonical); } catch { throw connectionFailure('connection_workspace_source_unavailable', '工作空间规范来源已不可用；未使用工作树中的旧连接副本。', 409); }
      if (current.workspace.id !== id) throw connectionFailure('connection_workspace_source_changed', '工作树与规范来源的工作空间编号不一致。', 409);
    }
  }
  const registered = workspace.listRegisteredWorkspaces().workspaces.filter(item => item.workspace?.id === id);
  if (registered.some(item => { try { return fs.realpathSync(item.rootPath) !== canonical; } catch { return true; } })) throw connectionFailure('connection_workspace_identity_conflict', '同一工作空间编号登记了不同来源，无法确认连接目标。', 409);
  return { rootPath: canonical, workspaceId: id };
}
