import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button } from 'antd';
import { codeApi, type CodeAuthorsResponse, type CodeBranchesResponse, type CodeSourceControlInput } from '../api/code-api';
import { BranchManagementPopover } from '../components/BranchManagementPopover';
import { HistoryFilters } from '../components/HistoryFilters';
import type { SourceControlBranchExtension } from '../components/SourceControlWorkbench';
import { branchSwitchFailure, branchSwitchImpact, type BranchSwitchFailure, type SourceControlBranch } from '../source-control-branches';
import { sourceControlWorktreeKey, type SourceControlRepository, type SourceControlWorktree } from '../source-control-model';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { useSourceControlRead } from './useSourceControlRead';
import type { SourceControlFetchActions } from './useSourceControlFetch';
import type { SourceControlSyncActions } from './useSourceControlSync';
import { SourceControlWorktreeMenu } from '../components/SourceControlWorktreeMenu';

const observationNote = (data: CodeBranchesResponse | CodeAuthorsResponse | null) => data ? [data.coverage.truncated ? '读取范围达到上限，当前记录不完整。' : '', ...data.diagnostics.map(item => item.message)].filter(Boolean).join('；') : '';
type LocationProps = { workspaceId: string; repository: SourceControlRepository; worktree: SourceControlWorktree; version: string };

function BranchControl({workspaceId, repository, worktree, version, ready, inlineVisible, rowVisible, openRequest, onOpenPosition, onViewChanges}: LocationProps & {
  ready: boolean; inlineVisible:boolean; rowVisible:boolean; openRequest:number; onOpenPosition(worktreeId: string): void; onViewChanges(): void;
}) {
  const {message} = App.useApp();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<BranchSwitchFailure | null>(null);
  const sourceKey = JSON.stringify([workspaceId, repository.id, worktree.worktreeId]);
  const currentSource = useRef(sourceKey); currentSource.current = sourceKey;
  const mounted = useRef(false), writing = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setFailure(null); setOpen(false); }, [sourceKey]);
  useEffect(() => {setOpen(false);}, [inlineVisible, rowVisible]);
  useEffect(() => {if (openRequest && ready && rowVisible) setOpen(true);}, [openRequest]);
  const loader = useCallback((input: CodeSourceControlInput, signal: AbortSignal) => codeApi.branches(workspaceId, input, signal), [workspaceId]);
  const input = {repositoryId: repository.id, worktreeId: worktree.worktreeId};
  const branches = useSourceControlRead(sourceKey, input, loader, Boolean(open && ready), version);
  const entries = branches.data?.branches || [];
  const refresh = useCallback(() => { setFailure(null); void branches.refresh(); }, [branches.refresh]);
  async function use(entry: SourceControlBranch, localName?: string) {
    if (writing.current || branches.loading || !branches.data) return false;
    const snapshot = branches.data;
    const isCurrent = () => mounted.current && currentSource.current === sourceKey;
    writing.current = true; setPending(true); setFailure(null);
    let succeeded = false;
    try {
      const result = await codeApi.switchBranch(workspaceId, {...input, targetRef: entry.ref, expectedTargetHash: entry.hash, expectedRevision: snapshot.observedRevision, ...(localName ? {localName} : {})});
      succeeded = true;
      if (isCurrent()) message.success('已切换到 ' + result.branch);
    } catch (error) {
      if (isCurrent()) {
        const observedFailure = branchSwitchFailure(error);
        setFailure(observedFailure); message.error(observedFailure.message);
      }
    } finally {
      writing.current = false;
      if (isCurrent()) setPending(false);
      // The completed write ends its wait now. Subsequent reads own independent feedback.
      if (isCurrent() && !succeeded) void branches.refresh();
    }
    return succeeded;
  }
  return <BranchManagementPopover repository={repository} worktree={worktree} entries={entries} ready={ready && worktree.status !== 'offline'} open={open}
    reading={branches.loading} pending={pending} failure={failure} readNote={observationNote(branches.data)}
    remoteLoading={branches.loading} remoteUpdatedAt={formatShortDateTime(branches.data?.readAt || '')} remoteError={branches.error}
    onOpenChange={setOpen} onTargetChange={() => setFailure(null)} onRefreshRemote={refresh}
    inspect={entry => branchSwitchImpact(repository, worktree, entries, entry)} onUse={use} onOpenPosition={onOpenPosition} onViewChanges={onViewChanges} />;
}

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
    rowControl: (repository, worktree, ready, context) => <BranchControl key={JSON.stringify([workspaceId, repository.id, worktree.worktreeId])} workspaceId={workspaceId} repository={repository} worktree={worktree} version={repository.refsVersion || repository.readVersion || ''} ready={ready && !syncing(repository)} inlineVisible={context.branchVisible} rowVisible={context.rowVisible} openRequest={branchRequest.key === key(repository, worktree) ? branchRequest.serial : 0}
      onOpenPosition={worktreeId => openPosition(repository.id, worktreeId, 'history')} onViewChanges={() => openPosition(repository.id, worktree.worktreeId, 'changes')} />,
    rowActions: fetchActions && syncActions ? (repository, worktree, ready, context) => {
      const available = ready && worktree.status !== 'offline' && Boolean(repository.gitId && repository.checkoutId);
      const unavailableReason = !available ? '当前来源尚未就绪，请刷新后重试'
        : !worktree.branch ? '当前工作树没有可同步的本地分支'
        : !worktree.head ? '当前分支还没有提交'
        : worktree.upstream === null ? '当前分支未设置远端跟踪分支'
        : !worktree.upstream ? '尚未确认当前分支的远端跟踪关系，请刷新后重试' : undefined;
      return <SourceControlWorktreeMenu sourceKey={JSON.stringify([key(repository, worktree), worktree.branch, worktree.head, worktree.upstream])} open={openMenu === key(repository, worktree)} onOpenChange={next => setOpenMenu(previous => next ? key(repository, worktree) : previous === key(repository, worktree) ? '' : previous)} repositoryName={repository.name} worktreeName={worktree.isMain ? '主工作树' : worktree.name} worktree={worktree} visible={context.rowVisible} ready={available} unavailableReason={unavailableReason} fetching={Boolean(fetchActions.pending[repository.id])} syncing={syncing(repository)} onManageBranch={() => setBranchRequest(previous => ({key:key(repository, worktree), serial:previous.serial + 1}))} onOpenTask={context.onOpenTask} onFetch={() => {void fetchActions.run([repository]);}} onSync={() => {void syncActions.run(repository, worktree);}} />;
    } : undefined,
    syncAction: syncActions ? (repository, worktree) => ({pending:syncing(repository) || Boolean(fetchActions?.pending[repository.id]), run:() => {if (!fetchActions?.pending[repository.id]) void syncActions.run(repository, worktree);}}) : undefined,
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
