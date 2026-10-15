import type { CodeCatalog } from './api/code-api';
import type { CodeWorktree } from './code-filters';

export type CodeSourceLabel = { name: string; role: string; description: string };

const normalizedPath = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/u, '');
const worktreeName = (path: string) => {
  const normalized = normalizedPath(path);
  return !normalized || /^[a-z]:$/iu.test(normalized) ? path : normalized.split('/').at(-1) || path;
};
const sourceRole = (kind?: 'main' | 'task' | 'worktree') =>
  kind === 'main' ? '工作空间登记目录' : kind === 'task' ? '任务工作树' : '工作树';

/** Names describe actual directories; the registered/task role remains separate. */
export function codeWorktreeLabel(member: CodeWorktree, peers: readonly CodeWorktree[] = []): CodeSourceLabel {
  const name = worktreeName(member.path);
  const duplicate = peers.some(peer => worktreeName(peer.path) === name && normalizedPath(peer.path) !== normalizedPath(member.path));
  return {
    name: duplicate ? name + '（' + member.path + '）' : name,
    role: sourceRole(member.kind),
    description: [member.branch, member.path].filter(Boolean).join(' · '),
  };
}

/** One group can contain differently named directories across selected repositories. */
export function codeWorktreeGroupLabel(catalog: CodeCatalog | null, groupId = 'main', repositoryIds: readonly string[] = []): CodeSourceLabel {
  const group = catalog?.worktreeGroups.find(item => item.id === groupId);
  const scopedPeers = (catalog?.worktrees || []).filter(member => !repositoryIds.length || repositoryIds.includes(member.repositoryId));
  const members = scopedPeers.filter(member => member.groupId === groupId);
  const labels = members.map(member => codeWorktreeLabel(member, scopedPeers));
  return {
    name: labels.length ? [...new Set(labels.map(label => label.name))].join('、') : '目录暂不可确认',
    role: sourceRole(group?.kind || members[0]?.kind),
    description: [...new Set([group?.kind === 'task' ? group.name : '', ...labels.map(label => label.description)].filter(Boolean))].join('；'),
  };
}
