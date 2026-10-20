import type { CodeCatalog } from './api/code-api';
import type { CodeWorktree } from './code-filters';

export type CodeSourceLabel = { name: string; role: string; description: string };

const normalizedPath = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/u, '');
const worktreeName = (path: string) => {
  const normalized = normalizedPath(path);
  return !normalized || /^[a-z]:$/iu.test(normalized) ? path : normalized.split('/').at(-1) || path;
};
const sourceRole = (isMain?: boolean) => isMain === true ? '主工作库' : '';

/** The code disambiguates similarly named repositories; an identical name needs no repetition. */
export function codeRepositoryLabel(repository: {name: string; code?: string | null}): string {
  const name = repository.name || '', code = repository.code || '';
  return name && code && code !== name ? name + '（' + code + '）' : name || code;
}

/** Names describe actual directories; only confirmed Git main worktrees receive a role. */
export function codeWorktreeLabel(member: CodeWorktree, peers: readonly CodeWorktree[] = []): CodeSourceLabel {
  const name = worktreeName(member.path);
  const duplicate = peers.some(peer => worktreeName(peer.path) === name && normalizedPath(peer.path) !== normalizedPath(member.path));
  return {
    name: duplicate ? name + '（' + member.path + '）' : name,
    role: sourceRole(member.isMain),
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
    role: sourceRole(members.length > 0 && members.every(member => member.isMain === true)),
    description: [...new Set([group?.kind === 'task' ? group.name : '', ...labels.map(label => label.description)].filter(Boolean))].join('；'),
  };
}
