import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { failure, type ConnectionScope } from '../domain/instance.ts';

export interface ConnectionSkillWorkspaceReader {
  getWorkspace(root: string): { rootPath: string; workspace: { id: string | null } };
  resolveSourceWorkspaceRoot(root: string): string | null;
  listRegisteredWorkspaces(): { workspaces: Array<{ rootPath: string; workspace?: { id: string | null } | null }> };
}
function commonGitDirectory(root: string): string | null {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const result = spawnSync('git', ['-C', root, 'rev-parse', '--git-common-dir'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 2000, maxBuffer: 64 * 1024 });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try { return fs.realpathSync(path.resolve(root, result.stdout.trim())); } catch { return null; }
}

/** The chosen source directory owns current instance files; Git only proves a related code location. */
export function resolveConnectionSkillWorkspace(target: string, workspace: ConnectionSkillWorkspaceReader): ConnectionScope {
  const requested = path.resolve(target), source = workspace.resolveSourceWorkspaceRoot(requested);
  if (!source) throw failure('connection_skill_workspace_missing', '目标目录不属于可用的工作空间。');
  const observed = workspace.getWorkspace(source), workspaceId = observed.workspace.id;
  if (!workspaceId) throw failure('connection_skill_workspace_invalid', '工作空间缺少稳定编号。');
  const rootPath = fs.realpathSync(observed.rootPath);
  const registrations = workspace.listRegisteredWorkspaces().workspaces.filter(item => item.workspace?.id === workspaceId);
  const roots = new Set<string>();
  for (const item of registrations) {
    try {
      const current = workspace.getWorkspace(item.rootPath), root = fs.realpathSync(current.rootPath);
      if (current.workspace.id !== workspaceId) throw new Error(); roots.add(root);
    } catch { throw failure('connection_skill_workspace_source_changed', '已登记工作空间的来源或身份不可确认；未改用其他配置。'); }
  }
  if (roots.size > 1) throw failure('connection_skill_workspace_ambiguous', '同一工作空间编号登记了多个来源，请明确唯一配置入口。');
  const selected = [...roots][0];
  if (!selected || selected === rootPath) return { rootPath, workspaceId };
  const sourceGit = commonGitDirectory(rootPath), registeredGit = commonGitDirectory(selected), targetGit = commonGitDirectory(requested);
  if (!sourceGit || !registeredGit || sourceGit !== registeredGit || targetGit !== registeredGit) throw failure('connection_skill_workspace_identity_conflict', '同编号目录不是可证明关联的代码来源；未使用另一目录的配置或认证。');
  // Registration selects the configuration source, independently of Git's primary checkout.
  return { rootPath: selected, workspaceId };
}
