import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { codeApi, type CodeAuthorsResponse, type CodeBranchesResponse, type CodeSourceControlInput } from '../api/code-api';
import { SourceControlBranchControl } from '../components/SourceControlBranchControl';
import { HistoryFilters } from '../components/HistoryFilters';
import type { SourceControlBranchExtension } from '../components/SourceControlWorkbench';
import { sourceControlWorktreeKey, type SourceControlRepository, type SourceControlWorktree } from '../source-control-model';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { useSourceControlRead } from './useSourceControlRead';
import type { SourceControlFetchActions } from './useSourceControlFetch';
import { sourceControlSyncUnavailableReason, type SourceControlSyncActions } from './useSourceControlSync';
import { SourceControlWorktreeMenu } from '../components/SourceControlWorktreeMenu';
import { codeRepositoryLabel } from '../code-source-labels';

const observationNote = (data: CodeBranchesResponse | CodeAuthorsResponse | null) => data ? [data.coverage.truncated ? '读取范围达到上限，当前记录不完整。' : '', ...data.diagnostics.map(item => item.message)].filter(Boolean).join('；') : '';
type LocationProps = { workspaceId: string; repository: SourceControlRepository; worktree: SourceControlWorktree; version: string };


function HistoryControls({active = true, workspaceId, repository, worktree, version, branchRef, authorEmail, query, onBranchChange, onAuthorChange, onClear}: LocationProps & {
  active?: boolean; branchRef: string; authorEmail: string; query: string; onBranchChange(ref: string): void; onAuthorChange(email: string): void; onClear(): void;
}) {
  const input: CodeSourceControlInput = {repositoryId: repository.id, worktreeId: worktree.worktreeId};
  const sourceKey = JSON.stringify([workspaceId, input]);
  const branchLoader = useCallback((value: CodeSourceControlInput, signal: AbortSignal) => codeApi.branches(workspaceId, value, signal), [workspaceId]);
  const authorLoader = useCallback((value: CodeSourceControlInput, signal: AbortSignal) => codeApi.authors(workspaceId, value, signal), [workspaceId]);
  const enabled = Boolean(active && workspaceId && worktree.status !== 'offline');
  const branches = useSourceControlRead(sourceKey, input, branchLoader, enabled, version);
  const authorInput = {...input, branch: branchRef === 'HEAD' ? undefined : branchRef};
  const authors = useSourceControlRead(JSON.stringify([workspaceId, authorInput]), authorInput, authorLoader, enabled, version);
  const authorNote = [authors.error, observationNote(authors.data)].filter(Boolean).join('；');
  return <>
    <HistoryFilters authors={authors.data?.authors || []} currentAuthor={authors.error ? null : authors.data?.currentAuthor || null} authorsLoading={enabled && (authors.loading || !authors.data && !authors.error)} worktree={worktree} entries={branches.data?.branches || []}
      branchRef={branchRef} authorEmail={authorEmail} query={query} remoteLoading={branches.loading}
      remoteUpdatedAt={formatShortDateTime(branches.data?.readAt || '')} remoteError={[branches.error, observationNote(branches.data)].filter(Boolean).join('；')}
      onBranchChange={onBranchChange} onAuthorChange={onAuthorChange} onClear={onClear} onRefreshRemote={() => void branches.refresh()} />
    {authorNote && <p className="branch-history-filter-note" role={authors.error ? 'alert' : 'status'}>{authorNote}{authors.error && <Button size="small" type="link" onClick={() => void authors.refresh()}>重试作者读取</Button>}</p>}
  </>;
}

/** Each concrete location owns its read-only history conditions. All writes live in the row adapter. */
export function useSourceControlBranches(workspaceId: string, fetchActions?: SourceControlFetchActions, syncActions?:SourceControlSyncActions): SourceControlBranchExtension {
  const [ranges, setRanges] = useState<Record<string, {branchRef: string; authorEmail: string}>>({});
  const [openMenu, setOpenMenu] = useState('');
  const [branchRequest, setBranchRequest] = useState({key:'', serial:0});
  const [selection, setSelection] = useState<SourceControlBranchExtension['selection']>();
  const serial = useRef(0);
  const key = (repository: SourceControlRepository, worktree: SourceControlWorktree) => JSON.stringify([workspaceId, sourceControlWorktreeKey(repository.id, worktree.worktreeId)]);
  const range = (repository: SourceControlRepository, worktree: SourceControlWorktree) => ranges[key(repository, worktree)] || {branchRef: 'HEAD', authorEmail: ''};
  const openPosition = (repositoryId: string, worktreeId: string, scene: 'history' | 'changes') => setSelection({key: workspaceId + ':' + ++serial.current, repositoryId, worktreeId, scene});
  useEffect(() => { setSelection(undefined); setOpenMenu(''); }, [workspaceId]);
  const syncing = (repository:SourceControlRepository) => repository.worktrees.some(worktree => syncActions?.pending[sourceControlWorktreeKey(repository.id, worktree.worktreeId)]);
  return {
    historyRange(repository, worktree) {
      const current = range(repository, worktree);
      return {branch: current.branchRef === 'HEAD' ? undefined : current.branchRef, authorEmail: current.authorEmail || undefined};
    },
    selection,
    rowControl: (repository, worktree, ready, context) => <SourceControlBranchControl key={JSON.stringify([workspaceId, repository.id, worktree.worktreeId])} workspaceId={workspaceId} fetchActions={fetchActions} repository={repository} worktree={worktree} version={repository.refsVersion || repository.readVersion || ''} ready={ready && !repository.cached && !syncing(repository)} inlineVisible={context.branchVisible} rowVisible={context.rowVisible} openRequest={branchRequest.key === key(repository, worktree) ? branchRequest.serial : 0}
      onOpenPosition={worktreeId => openPosition(repository.id, worktreeId, 'history')} onViewChanges={() => openPosition(repository.id, worktree.worktreeId, 'changes')} />,
    rowActions: fetchActions && syncActions ? (repository, worktree, ready, context) => {
      const available = ready && !repository.cached && worktree.status !== 'offline' && Boolean(repository.gitId && repository.checkoutId);
      const unavailableReason = !available ? '当前来源尚未就绪，请刷新后重试' : sourceControlSyncUnavailableReason(repository, worktree);
      return <SourceControlWorktreeMenu sourceKey={JSON.stringify([key(repository, worktree), worktree.branch, worktree.head, worktree.upstream])} open={openMenu === key(repository, worktree)} onOpenChange={next => setOpenMenu(previous => next ? key(repository, worktree) : previous === key(repository, worktree) ? '' : previous)} repositoryName={codeRepositoryLabel(repository)} worktreeName={worktree.isMain ? '主工作树' : worktree.name} worktree={worktree} visible={context.rowVisible} ready={available} unavailableReason={unavailableReason} fetching={Boolean(fetchActions.pending[repository.id])} syncing={syncing(repository)} onManageBranch={() => setBranchRequest(previous => ({key:key(repository, worktree), serial:previous.serial + 1}))} onOpenTask={context.onOpenTask} onFetch={() => {void fetchActions.run([repository]);}} onSync={() => {void syncActions.run(repository, worktree);}} />;
    } : undefined,
    syncAction: syncActions ? (repository, worktree) => repository.cached ? undefined : ({pending:syncing(repository) || Boolean(fetchActions?.pending[repository.id]), run:() => {if (!fetchActions?.pending[repository.id]) void syncActions.run(repository, worktree);}}) : undefined,
    viewChanges:(repositoryId, worktreeId) => openPosition(repositoryId, worktreeId, 'changes'),
    historyControls(repository, worktree, controls) {
      const id = key(repository, worktree), current = range(repository, worktree);
      return <HistoryControls active={controls.active} key={id} workspaceId={workspaceId} repository={repository} worktree={worktree} version={repository.refsVersion || repository.readVersion || ''} {...current} query={controls.query}
        onBranchChange={branchRef => setRanges(previous => ({...previous, [id]: {...current, branchRef}}))}
        onAuthorChange={authorEmail => setRanges(previous => ({...previous, [id]: {...current, authorEmail}}))}
        onClear={() => { setRanges(previous => ({...previous, [id]: {branchRef: 'HEAD', authorEmail: ''}})); controls.clearSearch(); }} />;
    },
  };
}
