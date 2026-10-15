import { Button } from 'antd';
import type { SourceControlSyncResult } from '../hooks/useSourceControlSync';
import { sourceControlWorktreeKey, type SourceControlRepository } from '../source-control-model';

const statusLabel:Record<string,string> = {succeeded:'已完成', failed:'失败', unavailable:'不可用', unknown:'结果未知', 'not-requested':'未执行'};

export function SourceControlSyncResults({repositories, results, onViewChanges}:{repositories:SourceControlRepository[]; results:Record<string,SourceControlSyncResult>; onViewChanges(repositoryId:string, worktreeId:string):void}) {
  const entries = Object.values(results).map(result => {
    const repository = repositories.find(repository => repository.id === result.repositoryId);
    const worktree = repository?.worktrees.find(worktree => worktree.worktreeId === result.worktreeId);
    return {repository, worktree, result};
  });
  if (!entries.length) return null;
  return <div className="source-control-sync-results">
    <ul>{entries.map(({repository, worktree, result}) => <li key={sourceControlWorktreeKey(result.repositoryId, result.worktreeId)} data-sync-repository={result.repositoryId} data-sync-worktree={result.worktreeId} data-sync-status={result.status}>
      <strong>{repository?.name || result.repositoryId} · {worktree?.isMain ? '主工作树' : worktree?.name || result.worktreeId}</strong><span>{statusLabel[result.status] || result.status}</span><p>{result.message}</p>
      <ul>{(['fetch', 'rebase', 'push'] as const).flatMap(phase => result[phase] ? [<li key={phase} data-sync-phase={phase} data-sync-phase-status={result[phase].status}><strong>{phase === 'fetch' ? '获取（Fetch）' : phase === 'rebase' ? '整合（Rebase）' : '推送（Push）'}</strong>：{statusLabel[result[phase].status] || result[phase].status} · {result[phase].message}</li>] : [])}</ul>
      {worktree && result.rebase?.status === 'failed' && <Button type="link" size="small" onClick={() => onViewChanges(result.repositoryId, result.worktreeId)}>查看现有改动</Button>}
    </li>)}</ul>
  </div>;
}
