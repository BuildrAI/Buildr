import { useMemo } from 'react';
import { Select, Space, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { SourceControlBranchControl } from '../../code/components/SourceControlBranchControl';
import { useSourceControlFetch } from '../../code/hooks/useSourceControlFetch';
import { useSourceControlSummary } from '../../code/hooks/useSourceControl';
import { useCodeSourceSelection } from '../../code/hooks/useCodeSourceSelection';
import { sourceControlRepository, type SourceControlRepository, type SourceControlWorktree } from '../../code/source-control-model';
import type { CodeBranchesResponse, CodeBranchSwitchResponse } from '../../code/api/code-api';
import type { SourceControlBranch } from '../../code/source-control-branches';
import { workspaceHref } from '../../../lib/labels';
import type { ServiceWorktree } from '../api/service-runtime-api';
import { dirtyLabel, shortCommit } from '../model';

type Props = {
  workspaceId: string; repositoryId: string | null; worktrees: ServiceWorktree[]; worktree: ServiceWorktree | null; disabled?: boolean;
  onWorktree(id: string): void; onSwitched(result: CodeBranchSwitchResponse): Promise<void>;
  onIndependent(entry: SourceControlBranch, snapshot: CodeBranchesResponse): Promise<void>; onBusy(busy: boolean): void;
};
const sourceWorktree = (item: ServiceWorktree): SourceControlWorktree => ({
  worktreeId: item.id, name: item.label, location: item.path, isMain: item.main, isRegistered: item.main,
  branch: item.branch, head: item.head, ahead: null, behind: null, taskId: item.taskId, taskTitle: item.taskTitle,
  status: 'ready', changes: [], commits: [], fileCount: item.dirty === null ? null : item.dirty ? 1 : 0, diagnostics: [],
});

/** Both entry points use the same branch read, checkout action and conflict feedback. */
export function ServiceSourcePicker({ workspaceId, repositoryId, worktrees, worktree, disabled, onWorktree, onSwitched, onIndependent, onBusy }: Props) {
  const summary = useSourceControlSummary(workspaceId), fetchActions = useSourceControlFetch(workspaceId);
  const currentSource = useCodeSourceSelection(workspaceId), navigate = useNavigate();
  const observed = summary.data?.repositories.find(item => item.id === repositoryId);
  const repository = useMemo<SourceControlRepository | null>(() => {
    if (!repositoryId) return null;
    const sources = worktrees.map(sourceWorktree);
    return observed ? { ...sourceControlRepository(observed), worktrees: sources } : {
      id: repositoryId, code: '', name: '当前服务代码库', location: worktrees[0]?.path || '',
      branch: null, branches: [], ahead: null, behind: null, status: 'ready', simulated: false,
      services: [], worktrees: sources, changes: [], commits: [],
    };
  }, [repositoryId, observed, worktrees]);
  const source = worktree ? sourceWorktree(worktree) : null;
  const viewChanges = () => {
    if (!repositoryId || !worktree) return;
    const target = { repositoryId, checkoutId: worktree.id };
    currentSource.select('source-control', [target], target);
    navigate(workspaceHref(workspaceId, '/code/source-control'));
  };
  return <div className="start-worktree-row runtime-start-choice is-selected" data-worktree-id={worktree?.id}>
    <div className="start-worktree-main">
      <label>工作树（Worktree）</label>
      <Select aria-label="代码目录" value={worktree?.id} disabled={disabled} onChange={onWorktree} options={[...worktrees].sort((a, b) => Number(b.main) - Number(a.main)).map(item => ({ value: item.id, label: `${item.main ? '主工作库' : item.taskTitle || item.label} · ${item.branch || '当前提交'}` }))} />
      <label>分支（Branch）</label>
      {repository && source ? <div className="runtime-source-branch-control"><SourceControlBranchControl key={source.worktreeId} workspaceId={workspaceId} repository={repository} worktree={source} version={`${source.branch}:${source.head}`} ready={!disabled} inlineVisible rowVisible openRequest={0} fetchActions={fetchActions} onSwitched={onSwitched} onIndependent={onIndependent} onBusy={onBusy} onOpenPosition={onWorktree} onViewChanges={viewChanges} /></div> : null}
      {worktree ? <><Space size={5} wrap><code>{shortCommit(worktree.head)}</code><Tag color={worktree.dirty ? 'gold' : undefined}>{dirtyLabel(worktree.dirty)}</Tag></Space><code className="runtime-start-path" title={worktree.path}>{worktree.path}</code></> : null}
    </div>
  </div>;
}
