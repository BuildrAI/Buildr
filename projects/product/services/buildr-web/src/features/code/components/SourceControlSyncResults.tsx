import { Button } from 'antd';
import type { SourceControlSyncResult } from '../hooks/useSourceControlSync';
import { sourceControlWorktreeKey, type SourceControlRepository } from '../source-control-model';

const statusLabel:Record<string,string> = {succeeded:'已完成', failed:'失败', unavailable:'不可用', unknown:'结果未知', 'not-requested':'未执行'};

export function SourceControlSyncResults({repositories, results, onViewChanges}:{repositories:SourceControlRepository[]; results:Record<string,SourceControlSyncResult>; onViewChanges(repositoryId:string, worktreeId:string):void}) {
  const entries = repositories.flatMap(repository => repository.worktrees.flatMap(worktree => {
    const result = results[sourceControlWorktreeKey(repository.id, worktree.worktreeId)]; return result ? [{repository, worktree, result}] : [];
  }));
  if (!entries.length) return null;
  return <details className="source-control-sync-results" open>
    <summary>同步结果</summary>
    <ul>{entries.map(({repository, worktree, result}) => <li key={sourceControlWorktreeKey(repository.id, worktree.worktreeId)} data-sync-repository={repository.id} data-sync-worktree={worktree.worktreeId} data-sync-status={result.status} role={result.status === 'succeeded' ? 'status' : 'alert'}>
      <strong>{repository.name} · {worktree.isMain ? '主工作树' : worktree.name}</strong><span>{statusLabel[result.status] || result.status}</span><p>{result.message}</p>
      <ul>{(['fetch', 'rebase', 'push'] as const).flatMap(phase => result[phase] ? [<li key={phase} data-sync-phase={phase} data-sync-phase-status={result[phase].status}><strong>{phase === 'fetch' ? '获取（Fetch）' : phase === 'rebase' ? '整合（Rebase）' : '推送（Push）'}</strong>：{statusLabel[result[phase].status] || result[phase].status} · {result[phase].message}</li>] : [])}</ul>
      {result.rebase?.status === 'failed' && <Button type="link" size="small" onClick={() => onViewChanges(repository.id, worktree.worktreeId)}>查看现有改动</Button>}
    </li>)}</ul>
  </details>;
}
