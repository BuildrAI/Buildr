import { useMemo, useState } from 'react';
import { BranchManagementPopover } from '../../features/code/components/BranchManagementPopover';
import { branchSwitchImpact, type SourceControlBranch } from '../../features/code/source-control-branches';
import type { SourceControlRepository, SourceControlWorktree } from '../../features/code/source-control-model';

export function MockBranchControl({repository, worktree, onSwitch, onPosition}:{repository:SourceControlRepository; worktree:SourceControlWorktree; onSwitch(branch:string):void; onPosition(id:string):void}) {
  const [pending, setPending] = useState(false);
  const [readTime, setReadTime] = useState('演示记录');
  const entries = useMemo<SourceControlBranch[]>(() => {
    const names = [...new Set([worktree.branch || '', 'dev', 'main', 'origin/dev'])].filter(Boolean);
    return names.map(name => {
      const remote = name.startsWith('origin/'); const occupied = repository.worktrees.find(item => item.branch === name);
      return {name,ref:(remote ? 'refs/remotes/' : 'refs/heads/') + name,kind:remote ? 'remote' : 'local',hash:'a'.repeat(40),upstream:remote ? null : 'origin/' + name,
        worktreeId:occupied?.worktreeId || null,worktreeLocation:occupied?.location || null,current:name === worktree.branch,localBranch:null,remote:remote ? 'origin' : null};
    });
  }, [repository, worktree]);
  return <BranchManagementPopover repository={repository} worktree={worktree} entries={entries} ready={worktree.status !== 'offline'} remoteLoading={false} remoteUpdatedAt={readTime} remoteError="" reading={false} readNote="" pending={pending} failure={null}
    onOpenChange={() => {}} onTargetChange={() => {}} onRefreshRemote={() => setReadTime('刚刚读取（模拟）')} inspect={entry => branchSwitchImpact(repository, worktree, entries, entry)}
    onUse={async (entry, name) => {setPending(true); await new Promise(resolve => setTimeout(resolve, 220)); onSwitch(name || entry.name.replace(/^origin\//, '')); setPending(false); return true;}}
    onOpenPosition={onPosition} onViewChanges={() => {}} />;
}
