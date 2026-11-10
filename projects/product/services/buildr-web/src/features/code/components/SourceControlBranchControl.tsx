import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { codeApi, type CodeBranchesResponse, type CodeBranchSwitchResponse, type CodeSourceControlInput } from '../api/code-api';
import { BranchManagementPopover } from './BranchManagementPopover';
import { branchSwitchFailure, branchSwitchImpact, type BranchSwitchFailure, type SourceControlBranch } from '../source-control-branches';
import type { SourceControlRepository, SourceControlWorktree } from '../source-control-model';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { useSourceControlRead } from '../hooks/useSourceControlRead';
import type { SourceControlFetchActions } from '../hooks/useSourceControlFetch';

const observationNote = (data: CodeBranchesResponse | null) => data ? [data.coverage.truncated ? '读取范围达到上限，当前记录不完整。' : '', ...data.diagnostics.map(item => item.message)].filter(Boolean).join('；') : '';
type LocationProps = { workspaceId: string; repository: SourceControlRepository; worktree: SourceControlWorktree; version: string };

export function SourceControlBranchControl({workspaceId, repository, worktree, version, ready, inlineVisible, rowVisible, openRequest, fetchActions, onOpenPosition, onViewChanges, onSwitched, onIndependent, onBusy}: LocationProps & {
  fetchActions?: SourceControlFetchActions; ready: boolean; inlineVisible:boolean; rowVisible:boolean; openRequest:number; onOpenPosition(worktreeId: string): void; onViewChanges(): void; onSwitched?(result: CodeBranchSwitchResponse): Promise<void>; onIndependent?(entry: SourceControlBranch, snapshot: CodeBranchesResponse): Promise<void>; onBusy?(busy: boolean): void;
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
  const entries = branches.data?.source.repositoryId === repository.id && branches.data.source.worktreeId === worktree.worktreeId ? branches.data.branches : [];
  const fetchResult = fetchActions?.results[repository.id];
  const fetching = Boolean(fetchActions?.pending[repository.id]);
  const fetchedAt = fetchActions?.successfulAt[JSON.stringify([repository.id, repository.gitId])];
  const resultMatches = fetchResult?.gitId === repository.gitId;
  const fetchError = resultMatches && fetchResult?.status !== 'succeeded'
    ? [fetchResult?.message, ...(fetchResult?.remotes || []).filter(remote => remote.status !== 'succeeded').map(remote => `${remote.name}：${remote.message}`)].filter(Boolean).join('；') : '';
  useEffect(() => { if (resultMatches && fetchResult) void branches.refresh(); }, [fetchResult, resultMatches, branches.refresh]);
  async function fetchRemote() {
    if (!fetchActions || !ready || pending || fetching || branches.loading || !repository.gitId || !repository.checkoutId) return;
    setFailure(null);
    try { await fetchActions.run([repository]); }
    catch (error) { if (mounted.current && currentSource.current === sourceKey) message.error(error instanceof Error ? error.message : '获取远程失败'); }
  }
  useEffect(() => { onBusy?.(pending || fetching); }, [pending, fetching, onBusy]);
  useEffect(() => () => { onBusy?.(false); }, [onBusy]);
  async function useIndependent(entry: SourceControlBranch) {
    if (!onIndependent || writing.current || fetching || branches.loading || !branches.data) return false;
    writing.current = true; setPending(true); setFailure(null);
    try { await onIndependent(entry, branches.data); return true; }
    catch (error) { if (mounted.current && currentSource.current === sourceKey) setFailure(branchSwitchFailure(error)); return false; }
    finally { writing.current = false; if (mounted.current && currentSource.current === sourceKey) { setPending(false); void branches.refresh(); } }
  }
  async function use(entry: SourceControlBranch, localName?: string) {
    if (writing.current || fetching || branches.loading || !branches.data) return false;
    const snapshot = branches.data;
    const isCurrent = () => mounted.current && currentSource.current === sourceKey;
    writing.current = true; setPending(true); setFailure(null);
    let succeeded = false;
    try {
      const result = await codeApi.switchBranch(workspaceId, {...input, targetRef: entry.ref, expectedTargetHash: entry.hash, expectedRevision: snapshot.observedRevision, ...(localName ? {localName} : {})});
      if (result.source.repositoryId !== repository.id || result.source.worktreeId !== worktree.worktreeId) throw new Error('分支操作返回的工作树身份不匹配，请重新读取。');
      await onSwitched?.(result);
      succeeded = true;
      if (isCurrent()) { void branches.refresh(); }
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
    reading={branches.loading} pending={pending || fetching} failure={failure} readNote={observationNote(branches.data)}
    fetching={fetching} fetchDisabled={!fetchActions || !ready || pending || branches.loading || !repository.gitId || !repository.checkoutId}
    fetchedAt={fetchedAt ? formatShortDateTime(fetchedAt) : ''} fetchError={fetchError}
    remoteError={branches.error} onFetchRemote={() => void fetchRemote()}
    onOpenChange={setOpen} onTargetChange={() => setFailure(null)}
    inspect={entry => branchSwitchImpact(repository, worktree, entries, entry)} onUse={use} onUseIndependent={onIndependent ? useIndependent : undefined} onOpenPosition={onOpenPosition} onViewChanges={onViewChanges} />;
}
