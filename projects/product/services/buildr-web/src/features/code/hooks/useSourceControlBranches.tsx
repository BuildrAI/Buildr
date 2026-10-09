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

const observationNote = (data: CodeBranchesResponse | CodeAuthorsResponse | null) => data ? [data.coverage.truncated ? '读取范围达到上限，当前记录不完整。' : '', ...data.diagnostics.map(item => item.message)].filter(Boolean).join('；') : '';
type LocationProps = { workspaceId: string; repository: SourceControlRepository; worktree: SourceControlWorktree; version: string };

function BranchControl({workspaceId, repository, worktree, version, ready, onRefresh, onOpenPosition, onViewChanges}: LocationProps & {
  ready: boolean; onRefresh(): void | Promise<void>; onOpenPosition(worktreeId: string): void; onViewChanges(): void;
}) {
  const {message} = App.useApp();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<BranchSwitchFailure | null>(null);
  const sourceKey = JSON.stringify([workspaceId, repository.id, worktree.worktreeId]);
  const currentSource = useRef(sourceKey); currentSource.current = sourceKey;
  const mounted = useRef(false), writing = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setFailure(null); setOpen(false); }, [sourceKey]);
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
      // Closing a popup does not revoke an issued write. Reobserve both success and failure effects.
      await Promise.allSettled([onRefresh(), ...(isCurrent() ? [branches.refresh()] : [])]);
      writing.current = false;
      if (isCurrent()) setPending(false);
    }
    return succeeded;
  }
  return <BranchManagementPopover repository={repository} worktree={worktree} entries={entries} ready={ready && worktree.status !== 'offline'}
    reading={branches.loading} pending={pending} failure={failure} readNote={observationNote(branches.data)}
    remoteLoading={branches.loading} remoteUpdatedAt={formatShortDateTime(branches.data?.readAt || '')} remoteError={branches.error}
    onOpenChange={setOpen} onTargetChange={() => setFailure(null)} onRefreshRemote={refresh}
    inspect={entry => branchSwitchImpact(repository, worktree, entries, entry)} onUse={use} onOpenPosition={onOpenPosition} onViewChanges={onViewChanges} />;
}

function HistoryControls({workspaceId, repository, worktree, version, branchRef, authorEmail, query, onBranchChange, onAuthorChange, onClear}: LocationProps & {
  branchRef: string; authorEmail: string; query: string; onBranchChange(ref: string): void; onAuthorChange(email: string): void; onClear(): void;
}) {
  const input: CodeSourceControlInput = {repositoryId: repository.id, worktreeId: worktree.worktreeId};
  const sourceKey = JSON.stringify([workspaceId, input]);
  const branchLoader = useCallback((value: CodeSourceControlInput, signal: AbortSignal) => codeApi.branches(workspaceId, value, signal), [workspaceId]);
  const authorLoader = useCallback((value: CodeSourceControlInput, signal: AbortSignal) => codeApi.authors(workspaceId, value, signal), [workspaceId]);
  const enabled = Boolean(workspaceId && worktree.status !== 'offline');
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
export function useSourceControlBranches(workspaceId: string, version: string, onRefresh: () => void | Promise<void>): SourceControlBranchExtension {
  const [ranges, setRanges] = useState<Record<string, {branchRef: string; authorEmail: string}>>({});
  const [selection, setSelection] = useState<SourceControlBranchExtension['selection']>();
  const serial = useRef(0);
  const owner = useRef({workspaceId, onRefresh, mounted: false});
  owner.current.workspaceId = workspaceId; owner.current.onRefresh = onRefresh;
  useEffect(() => { owner.current.mounted = true; return () => { owner.current.mounted = false; }; }, []);
  const refreshOwner = useCallback(async () => {
    if (owner.current.mounted && owner.current.workspaceId === workspaceId) await owner.current.onRefresh();
  }, [workspaceId]);
  const key = (repository: SourceControlRepository, worktree: SourceControlWorktree) => JSON.stringify([workspaceId, sourceControlWorktreeKey(repository.id, worktree.worktreeId)]);
  const range = (repository: SourceControlRepository, worktree: SourceControlWorktree) => ranges[key(repository, worktree)] || {branchRef: 'HEAD', authorEmail: ''};
  const openPosition = (repositoryId: string, worktreeId: string, scene: 'history' | 'changes') => setSelection({key: workspaceId + ':' + ++serial.current, repositoryId, worktreeId, scene});
  useEffect(() => { setSelection(undefined); }, [workspaceId]);
  return {
    historyRange(repository, worktree) {
      const current = range(repository, worktree);
      return {branch: current.branchRef === 'HEAD' ? undefined : current.branchRef, authorEmail: current.authorEmail || undefined};
    },
    selection,
    rowControl: (repository, worktree, ready) => <BranchControl key={JSON.stringify([workspaceId, repository.id, worktree.worktreeId])} workspaceId={workspaceId} repository={repository} worktree={worktree} version={version} ready={ready} onRefresh={refreshOwner}
      onOpenPosition={worktreeId => openPosition(repository.id, worktreeId, 'history')} onViewChanges={() => openPosition(repository.id, worktree.worktreeId, 'changes')} />,
    historyControls(repository, worktree, controls) {
      const id = key(repository, worktree), current = range(repository, worktree);
      return <HistoryControls key={id} workspaceId={workspaceId} repository={repository} worktree={worktree} version={version} {...current} query={controls.query}
        onBranchChange={branchRef => setRanges(previous => ({...previous, [id]: {...current, branchRef}}))}
        onAuthorChange={authorEmail => setRanges(previous => ({...previous, [id]: {...current, authorEmail}}))}
        onClear={() => { setRanges(previous => ({...previous, [id]: {branchRef: 'HEAD', authorEmail: ''}})); controls.clearSearch(); }} />;
    },
  };
}
