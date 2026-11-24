import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, App, Button, Dropdown, Input, Modal } from 'antd';
import { CloudDownloadOutlined, DeleteOutlined, MoreOutlined, PlusOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import { useFileEditingContext } from '../../workbench/editor/FileEditingContext';
import { formatShortDateTime } from '../../workbench/ui/date-format';
import { BranchManagementPopover } from '../../workbench/source-control/BranchManagementPopover';
import { HistoryFilters } from '../../workbench/source-control/HistoryFilters';
import { SourceControlCommitPanel } from '../../workbench/source-control/SourceControlCommitPanel';
import { SourceControlDiffEditor } from '../../workbench/source-control/SourceControlDiffEditor';
import { SourceControlOperationNotices } from '../../workbench/source-control/SourceControlOperationNotices';
import { SourceControlWorktreeMenu } from '../../workbench/source-control/SourceControlWorktreeMenu';
import { SourceControlWorkbench, type SourceControlBranchExtension } from '../../workbench/source-control/SourceControlWorkbench';
import { SourceControlActions } from '../../workbench/source-control/source-control-actions';
import { branchSwitchFailure, branchSwitchImpact, type BranchSwitchFailure, type SourceControlBranch } from '../../workbench/source-control/source-control-branches';
import { codeRepositoryLabel } from '../../workbench/source-control/repository-labels';
import {
  sourceControlChange,
  sourceControlRepositoryHasChanges,
  sourceControlWorktreeKey,
  type SourceControlFileTarget,
  type SourceControlReader,
  type SourceControlRepository,
  type SourceControlScene,
  type SourceControlWorktree,
} from '../../workbench/source-control/source-control-model';
import type {
  CodeActionSource,
  CodeActionsClient,
  CodeAuthorsResponse,
  CodeBranchSwitchResponse,
  CodeBranchesResponse,
  CodeDiffResponse,
  CodeFetchRepositoryResult,
  CodeFetchResponse,
  CodeSourceControlInput,
  CodeSyncContextResponse,
  CodeSyncResponse,
  CommitContext,
  CommitMode,
  GenerationRun,
  GitMutationResult,
  ModelSelection,
  PushRetry,
} from '../../workbench/source-control/read-contracts';
import { useSourceControlDiscard } from '../../workbench/source-control/useSourceControlDiscard';
import { useSourceControlRead } from '../../workbench/source-control/useSourceControlRead';
import type { SourceControlSyncResult } from '../../workbench/source-control/SourceControlSyncResults';
import { useOptionalAgentConversations } from '../agent-conversations/AgentConversationsContext';
import {
  directoryEditableDocument,
  type DirectoryCatalog,
  type DirectoryRequest,
  type DirectoryScope,
  type DirectorySelection,
  type EditableFileSnapshot,
  type WorktreeContext,
} from './api';

type Props = {
  workspaceId: string;
  scope: DirectoryScope;
  baseRequest: DirectoryRequest;
  requestFor: (selection: DirectorySelection | null) => DirectoryRequest;
  active: boolean;
  version: number;
  current: DirectorySelection | null;
  explicitSelection?: DirectorySelection | null;
  catalog: DirectoryCatalog | null;
  catalogError: string;
  catalogLoading: boolean;
  refreshCatalog(): Promise<void>;
  discoverMore(): Promise<void>;
  discoveringMore?: boolean;
  prioritizeRepository(repositoryPath: string): void;
  onSelectCheckout(target: DirectorySelection): void;
  onOpenCurrent?(target: SourceControlFileTarget): void;
};

const noTask = () => {};
const observationNote = (data: { coverage: { truncated: boolean }; diagnostics: Array<{ message: string }> } | null) =>
  data ? [data.coverage.truncated ? '读取范围达到上限，当前记录不完整。' : '', ...data.diagnostics.map(item => item.message)].filter(Boolean).join('；') : '';

function syncUnavailableReason(repository: SourceControlRepository, worktree: SourceControlWorktree): string | undefined {
  if (repository.cached) return '正在核对上次结果，请稍后重试';
  if (!repository.gitId || !worktree.worktreeId || repository.status === 'offline' || worktree.status === 'offline') return '当前来源尚未就绪，请刷新后重试';
  if (!worktree.branch) return '当前工作树没有可同步的本地分支';
  if (!worktree.head) return '当前分支还没有提交';
  if (worktree.upstream === null) return '当前分支未设置远端跟踪分支';
  if (!worktree.upstream) return '尚未确认当前分支的远端跟踪关系，请刷新后重试';
  return undefined;
}

function DirectoryBranchControl({ workspaceId, repository, worktree, version, ready, inlineVisible, rowVisible, openRequest, requestFor, fetchState, onFetch, onOpenPosition, onViewChanges, onSwitched, onBusy }: {
  workspaceId: string;
  repository: SourceControlRepository;
  worktree: SourceControlWorktree;
  version: string;
  ready: boolean;
  inlineVisible: boolean;
  rowVisible: boolean;
  openRequest: number;
  requestFor: Props['requestFor'];
  fetchState: { pending: boolean; result?: CodeFetchRepositoryResult; fetchedAt?: string };
  onFetch(): Promise<void>;
  onOpenPosition(worktreeId: string): void;
  onViewChanges(): void;
  onSwitched(): Promise<void>;
  onBusy?(busy: boolean): void;
}) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<BranchSwitchFailure | null>(null);
  const sourceKey = JSON.stringify([workspaceId, repository.id, worktree.worktreeId]);
  const currentSource = useRef(sourceKey); currentSource.current = sourceKey;
  const mounted = useRef(false), writing = useRef(false);
  const busyListener = useRef(onBusy); busyListener.current = onBusy;
  const requestForRef = useRef(requestFor); requestForRef.current = requestFor;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setFailure(null); setOpen(false); }, [sourceKey]);
  useEffect(() => { setOpen(false); }, [inlineVisible, rowVisible]);
  useEffect(() => { if (openRequest && ready && rowVisible) setOpen(true); }, [openRequest, ready, rowVisible]);
  const loader = useCallback((_input: object, signal: AbortSignal) =>
    requestForRef.current({ repositoryId: repository.id, checkoutId: worktree.worktreeId })<CodeBranchesResponse>('branches', {}, signal),
  [repository.id, worktree.worktreeId]);
  const branches = useSourceControlRead(sourceKey, {}, loader, Boolean(open && ready && !pending && !fetchState.pending), version);
  const entries = branches.data?.source.repositoryId === repository.id && branches.data.source.worktreeId === worktree.worktreeId ? branches.data.branches : [];
  const fetchResult = fetchState.result;
  const resultMatches = fetchResult?.gitId === repository.gitId;
  const fetchError = resultMatches && fetchResult?.status !== 'succeeded'
    ? [fetchResult?.message, ...(fetchResult?.remotes || []).filter(remote => remote.status !== 'succeeded').map(remote => `${remote.name}：${remote.message}`)].filter(Boolean).join('；') : '';
  useEffect(() => { if (resultMatches && fetchResult) void branches.refresh(); }, [fetchResult, resultMatches, branches.refresh]);
  async function fetchRemote() {
    if (!ready || pending || fetchState.pending || branches.loading || !repository.gitId) return;
    setFailure(null);
    try { await onFetch(); }
    catch (error) { if (mounted.current && currentSource.current === sourceKey) message.error(error instanceof Error ? error.message : '获取远程失败'); }
  }
  useEffect(() => { busyListener.current?.(pending || fetchState.pending); }, [pending, fetchState.pending]);
  useEffect(() => () => { busyListener.current?.(false); }, []);
  async function use(entry: SourceControlBranch, localName?: string) {
    if (writing.current || fetchState.pending || branches.loading || !branches.data) return false;
    const snapshot = branches.data;
    const isCurrent = () => mounted.current && currentSource.current === sourceKey;
    branches.cancel(); busyListener.current?.(true);
    writing.current = true; setPending(true); setFailure(null);
    let succeeded = false;
    try {
      const req = requestForRef.current({ repositoryId: repository.id, checkoutId: worktree.worktreeId });
      const result = await req<CodeBranchSwitchResponse>('branch-switch', {
        targetRef: entry.ref,
        expectedTargetHash: entry.hash,
        expectedRevision: snapshot.observedRevision,
        ...(localName ? { localName } : {}),
      });
      if (result.source.repositoryId !== repository.id || result.source.worktreeId !== worktree.worktreeId) throw new Error('分支操作返回的工作树身份不匹配，请重新读取。');
      await onSwitched();
      succeeded = true;
      if (isCurrent()) void branches.refresh();
      if (isCurrent()) message.success('已切换到 ' + (result.branch || entry.name));
    } catch (error) {
      if (isCurrent()) {
        const observedFailure = branchSwitchFailure(error);
        setFailure(observedFailure);
        message.error(observedFailure.message);
      }
    } finally {
      writing.current = false;
      if (isCurrent()) setPending(false);
      if (isCurrent() && !succeeded) void branches.refresh();
    }
    return succeeded;
  }
  return <BranchManagementPopover repository={repository} worktree={worktree} entries={entries} ready={ready && worktree.status !== 'offline'} open={open} placement="leftTop"
    reading={branches.loading} pending={pending || fetchState.pending} failure={failure} readNote={observationNote(branches.data)}
    fetching={fetchState.pending} fetchDisabled={!ready || pending || branches.loading || !repository.gitId}
    fetchedAt={fetchState.fetchedAt ? formatShortDateTime(fetchState.fetchedAt) : ''} fetchError={fetchError}
    remoteError={branches.error} onFetchRemote={() => void fetchRemote()}
    onOpenChange={setOpen} onTargetChange={() => setFailure(null)}
    inspect={entry => branchSwitchImpact(repository, worktree, entries, entry)} onUse={use} onOpenPosition={onOpenPosition} onViewChanges={onViewChanges} />;
}

function DirectoryHistoryControls({ active, repository, worktree, version, branchRef, authorEmail, query, requestFor, onBranchChange, onAuthorChange, onClear }: {
  active: boolean;
  repository: SourceControlRepository;
  worktree: SourceControlWorktree;
  version: string;
  branchRef: string;
  authorEmail: string;
  query: string;
  requestFor: Props['requestFor'];
  onBranchChange(ref: string): void;
  onAuthorChange(email: string): void;
  onClear(): void;
}) {
  const requestForRef = useRef(requestFor); requestForRef.current = requestFor;
  const branchLoader = useCallback((_input: object, signal: AbortSignal) =>
    requestForRef.current({ repositoryId: repository.id, checkoutId: worktree.worktreeId })<CodeBranchesResponse>('branches', {}, signal),
  [repository.id, worktree.worktreeId]);
  const authorLoader = useCallback((input: CodeSourceControlInput, signal: AbortSignal) =>
    requestForRef.current({ repositoryId: repository.id, checkoutId: worktree.worktreeId })<CodeAuthorsResponse>('authors', input, signal),
  [repository.id, worktree.worktreeId]);
  const enabled = Boolean(active && worktree.status !== 'offline');
  const sourceKey = JSON.stringify([repository.id, worktree.worktreeId]);
  const branches = useSourceControlRead(sourceKey, {}, branchLoader, enabled, version);
  const authorInput = useMemo<CodeSourceControlInput>(() => ({ repositoryId: repository.id, worktreeId: worktree.worktreeId, ...(branchRef === 'HEAD' ? {} : { branch: branchRef }) }), [repository.id, worktree.worktreeId, branchRef]);
  const authors = useSourceControlRead(JSON.stringify(authorInput), authorInput, authorLoader, enabled, version);
  const authorNote = [authors.error, observationNote(authors.data)].filter(Boolean).join('；');
  return <>
    <HistoryFilters authors={authors.data?.authors || []} currentAuthor={authors.error ? null : authors.data?.currentAuthor || null} authorsLoading={enabled && (authors.loading || !authors.data && !authors.error)} worktree={worktree} entries={branches.data?.branches || []}
      branchRef={branchRef} authorEmail={authorEmail} query={query} remoteLoading={branches.loading} popoverPlacement="bottomRight"
      remoteUpdatedAt={formatShortDateTime(branches.data?.readAt || '')} remoteError={[branches.error, observationNote(branches.data)].filter(Boolean).join('；')}
      onBranchChange={onBranchChange} onAuthorChange={onAuthorChange} onClear={onClear} onRefreshRemote={() => void branches.refresh()} />
    {authorNote && <p className="branch-history-filter-note" role={authors.error ? 'alert' : 'status'}>{authorNote}{authors.error && <Button size="small" type="link" onClick={() => void authors.refresh()}>重试作者读取</Button>}</p>}
  </>;
}

export function DirectorySourceControl({ workspaceId, scope, baseRequest, requestFor, active, version, current, explicitSelection, catalog, catalogError, catalogLoading, refreshCatalog, discoverMore, discoveringMore = false, prioritizeRepository, onSelectCheckout, onOpenCurrent }: Props) {
  const { message } = App.useApp();
  const editing = useFileEditingContext();
  const conversations = useOptionalAgentConversations();
  const modelCatalog = conversations?.modelCatalog ?? [];
  const modelsLoading = conversations ? (!conversations.modelCatalogReady && !conversations.modelCatalog.length && !conversations.modelCatalogError) : false;
  const modelError = conversations?.modelCatalogError ?? '';
  const hasConversations = Boolean(conversations);
  const conversationCatalogReady = conversations?.modelCatalogReady ?? false;
  const refreshConversationCatalog = conversations?.refreshModelCatalog;
  useEffect(() => {
    if (active && hasConversations && !conversationCatalogReady) void refreshConversationCatalog?.().catch(() => {});
  }, [active, hasConversations, conversationCatalogReady, refreshConversationCatalog]);

  const [scene, setScene] = useState<SourceControlScene>('changes');
  const [catalogMenuOpen, setCatalogMenuOpen] = useState(false);
  useEffect(() => { setCatalogMenuOpen(false); }, [workspaceId, active]);

  const requestForRef = useRef(requestFor); requestForRef.current = requestFor;
  const baseRequestRef = useRef(baseRequest); baseRequestRef.current = baseRequest;
  const refreshRef = useRef(refreshCatalog); refreshRef.current = refreshCatalog;
  const activeRef = useRef(active); activeRef.current = active;
  const mountedRef = useRef(false);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Build SourceControlRepository[] cleanly from backend catalog
  const repositories = useMemo<SourceControlRepository[]>(() => {
    const mapped = (catalog?.repositories ?? []).flatMap<SourceControlRepository & {_isRoot:boolean}>(repo => {
      const worktrees: SourceControlWorktree[] = repo.members.map(member => ({
        worktreeId: member.worktreeId,
        name: member.name,
        location: member.location,
        branch: member.branch,
        head: member.head,
        upstream: member.upstream,
        ahead: member.ahead,
        behind: member.behind,
        isMain: member.isMain,
        isRegistered: member.isRegistered,
        changes: member.files.map(sourceControlChange),
        commits: [],
        fileCount: member.fileCount,
        observedRevision: member.observedRevision,
        status: member.status,
        diagnostics: member.diagnostics,
      }));
      const registered = worktrees.find(item => item.isRegistered) || worktrees.find(item => item.isMain) || worktrees[0];
      const displayCode = repo.path ? (repo.code || repo.name) : (scope.name || repo.code || repo.name);
      const displayName = repo.path ? repo.name : (scope.name || repo.name);
      if (!registered) return [{id:repo.id, discoveryKey:repo.path, location:repo.path, code:displayCode, name:displayName,
        status:'offline' as const, branch:null, branches:[], pending:repo.pending, fileCount:null,
        services:[], simulated:false, ahead:null, behind:null, changes:[], commits:[], worktrees:[], worktreeCount:null,
        diagnostics:repo.error ? [repo.error] : [], _isRoot:repo.path === ''}];
      return [{
        ...registered,
        id: repo.id,
        discoveryKey: repo.path,
        gitId: repo.gitId,
        checkoutId: repo.checkouts.defaultId ?? registered.worktreeId,
        readVersion: `${repo.readAt ?? catalog!.readAt}:${version}`,
        refsVersion: `${repo.readAt ?? catalog!.readAt}:${version}`,
        code: displayCode,
        name: displayName,
        branches: [],
        simulated: false,
        services: [],
        worktrees,
        worktreeCount: repo.checkouts.members.length,
        _isRoot: repo.path === '',
      }];
    });
    mapped.sort((a, b) => Number(b._isRoot) - Number(a._isRoot) || Number(sourceControlRepositoryHasChanges(b)) - Number(sourceControlRepositoryHasChanges(a)) || a.code.localeCompare(b.code));
    return mapped.map(({ _isRoot: _, ...repo }) => repo);
  }, [catalog, scope.name, version]);
  const defaultRepositories = useMemo(() => {
    const byId = new Map(repositories.map(repository => [repository.id, repository]));
    return (catalog?.repositories ?? []).flatMap(repo => byId.get(repo.id) ?? []);
  }, [catalog, repositories]);

  const reader = useMemo<SourceControlReader>(() => ({
    history: (input, signal) => requestForRef.current(input.worktreeId ? { repositoryId: input.repositoryId!, checkoutId: input.worktreeId } : null)('history', input, signal),
    commit: (input, signal) => requestForRef.current(input.worktreeId ? { repositoryId: input.repositoryId!, checkoutId: input.worktreeId } : null)('commit', input, signal),
    diff: (input, signal) => requestForRef.current(input.worktreeId ? { repositoryId: input.repositoryId!, checkoutId: input.worktreeId } : null)('diff', input, signal),
    sourceFile: (input, signal) => requestForRef.current(input.worktreeId ? { repositoryId: input.repositoryId!, checkoutId: input.worktreeId } : null)('source-file', input, signal),
  }), []);

  // Actions (commit + commit-message generation)
  const actionsClient = useMemo<CodeActionsClient>(() => {
    const reqFor = (source: CodeActionSource) => requestForRef.current({ repositoryId: source.repositoryId, checkoutId: source.worktreeId });
    return {
      context: (source, signal) => reqFor(source)<CommitContext>('commit-context', { repositoryId: source.repositoryId, worktreeId: source.worktreeId }, signal),
      generate: (source, expectedRevision, model: ModelSelection) => reqFor(source)<GenerationRun>('commit-message', {
        repositoryId: source.repositoryId, worktreeId: source.worktreeId, expectedRevision,
        modelAccountId: model.modelAccountId, modelId: model.modelId, accountIdentity: model.accountIdentity, accountRevision: model.accountRevision, label: model.label,
        ...(model.serviceTier ? { serviceTier: model.serviceTier } : {}),
        ...(model.reasoningEffort ? { reasoningEffort: model.reasoningEffort } : {}),
      }),
      commit: (source, expectedRevision, msg: string, mode: CommitMode) => reqFor(source)<GitMutationResult>('commit-changes', {
        repositoryId: source.repositoryId, worktreeId: source.worktreeId, expectedRevision, message: msg, mode,
      }),
      push: (source, retry: PushRetry) => reqFor(source)<GitMutationResult>('commit-push', {
        repositoryId: source.repositoryId, worktreeId: source.worktreeId, expectedHead: retry.expectedHead, expectedPushRevision: retry.expectedPushRevision,
      }),
      discardContext: (source, filePath) => reqFor(source)('discard-context', {
        repositoryId: source.repositoryId, worktreeId: source.worktreeId, ...(filePath !== undefined ? { path: filePath } : {}),
      }),
      discard: (source, expectedRevision, filePath) => reqFor(source)('discard-changes', {
        repositoryId: source.repositoryId, worktreeId: source.worktreeId, expectedRevision, ...(filePath !== undefined ? { path: filePath } : {}),
      }),
      run: (_source, runId) => baseRequestRef.current<GenerationRun>('commit-message-run', { runId }),
      cancel: (_source, runId) => baseRequestRef.current<GenerationRun>('commit-message-cancel', { runId }),
    };
  }, []);

  const actions = useMemo(() => new SourceControlActions(actionsClient, () => refreshRef.current()), [actionsClient]);
  const [, forceActionsRender] = useReducer(value => value + 1, 0);
  useEffect(() => actions.subscribe(forceActionsRender), [actions]);
  useEffect(() => () => actions.dispose(), [actions]);

  const discard = useSourceControlDiscard(workspaceId, actionsClient, () => refreshRef.current(), active);

  // Fetch state (batch + per-repo)
  const [fetchState, setFetchState] = useState<{
    pending: Record<string, boolean>;
    successfulAt: Record<string, string>;
    results: Record<string, CodeFetchRepositoryResult>;
    feedback: Record<string, CodeFetchRepositoryResult>;
  }>({ pending: {}, successfulAt: {}, results: {}, feedback: {} });
  const fetchInFlight = useRef(new Set<string>());
  const runFetch = useCallback(async (targets: SourceControlRepository[]) => {
    const unique = [...new Map(targets.filter(item => !item.cached && item.gitId && item.checkoutId).map(item => [item.id, item])).values()];
    if (!unique.length || unique.some(item => fetchInFlight.current.has(item.id))) return;
    for (const item of unique) fetchInFlight.current.add(item.id);
    setFetchState(prev => ({ ...prev, pending: { ...prev.pending, ...Object.fromEntries(unique.map(item => [item.id, true])) } }));
    const outcomes: CodeFetchRepositoryResult[] = [];
    let readAt = new Date().toISOString();
    try {
      for (let start = 0; start < unique.length; start += 128) {
        const chunk = unique.slice(start, start + 128);
        try {
          const res = await baseRequestRef.current<CodeFetchResponse>('fetch', {
            repositories: chunk.map(item => ({ repositoryId: item.id, repositoryPath: item.discoveryKey, expectedGitId: item.gitId ?? null, expectedCheckoutId: item.checkoutId ?? null })),
          });
          readAt = res.readAt;
          outcomes.push(...res.repositories);
        } catch (error) {
          outcomes.push(...chunk.map(item => ({
            repositoryId: item.id,
            gitId: item.gitId ?? null,
            status: 'unknown' as const,
            message: '获取结果未知，请重新读取核对。' + (error instanceof Error ? ' ' + error.message : ''),
            remotes: [],
          })));
        }
      }
      await refreshRef.current();
    } finally {
      for (const item of unique) fetchInFlight.current.delete(item.id);
      if (mountedRef.current) {
        setFetchState(prev => {
          const pending = { ...prev.pending };
          for (const item of unique) delete pending[item.id];
          const results = { ...prev.results, ...Object.fromEntries(outcomes.map(item => [item.repositoryId, item])) };
          const successfulAt = { ...prev.successfulAt };
          for (const item of outcomes) if (item.status === 'succeeded') successfulAt[JSON.stringify([item.repositoryId, item.gitId])] = readAt;
          const feedback = Object.fromEntries(outcomes.map(item => [item.repositoryId, item]));
          return { pending, successfulAt, results, feedback };
        });
      }
    }
  }, []);

  // Sync state (per-worktree + all serialized per gitId)
  const [syncState, setSyncState] = useState<{
    pending: Record<string, boolean>;
    results: Record<string, SourceControlSyncResult>;
    all: boolean;
  }>({ pending: {}, results: {}, all: false });
  const syncInFlight = useRef(new Set<string>());
  const syncAllBusy = useRef(false);
  const latestSync = useRef<Record<string, SourceControlSyncResult>>({});
  const saveSync = useCallback((result: SourceControlSyncResult) => {
    const key = sourceControlWorktreeKey(result.repositoryId, result.worktreeId);
    latestSync.current[key] = result;
    if (!mountedRef.current) return;
    setSyncState(prev => ({ ...prev, results: { ...prev.results, [key]: result } }));
  }, []);
  const runSync = useCallback(async (repository: SourceControlRepository, worktree: SourceControlWorktree) => {
    const key = sourceControlWorktreeKey(repository.id, worktree.worktreeId);
    if (!activeRef.current || repository.cached || syncInFlight.current.has(repository.id)) return;
    syncInFlight.current.add(repository.id);
    delete latestSync.current[key];
    setSyncState(prev => {
      const nextResults = { ...prev.results }; delete nextResults[key];
      return { ...prev, results: nextResults, pending: { ...prev.pending, [key]: true } };
    });
    let issued = false;
    try {
      const req = requestForRef.current({ repositoryId: repository.id, checkoutId: worktree.worktreeId });
      const context = await req<CodeSyncContextResponse>('sync-context', {});
      if (context.source.repositoryId !== repository.id || context.source.worktreeId !== worktree.worktreeId || context.source.location !== worktree.location
        || context.branch !== worktree.branch || context.head !== (worktree.head || null) || context.target !== (worktree.upstream || null)) {
        throw new Error('来源、分支或提交已变化，请核对更新后的状态再同步。');
      }
      if (!mountedRef.current || !activeRef.current) return;
      if (!context.available) {
        saveSync({ repositoryId: repository.id, worktreeId: worktree.worktreeId, status: 'unavailable', message: context.reason || '当前来源暂不可同步。' });
        return;
      }
      issued = true;
      const res = await req<CodeSyncResponse>('sync', { expectedRevision: context.revision });
      saveSync({ ...res, repositoryId: repository.id, worktreeId: worktree.worktreeId });
    } catch (error) {
      saveSync({
        repositoryId: repository.id,
        worktreeId: worktree.worktreeId,
        status: issued ? 'unknown' : 'failed',
        message: issued ? ('同步结果尚未确认，请重新读取核对。' + (error instanceof Error ? ' ' + error.message : '')) : (error instanceof Error ? error.message : '同步前读取失败，请重试。'),
      });
    } finally {
      syncInFlight.current.delete(repository.id);
      await refreshRef.current().catch(() => {});
      if (mountedRef.current) {
        setSyncState(prev => {
          const pending = { ...prev.pending }; delete pending[key];
          return { ...prev, pending };
        });
      }
    }
  }, [saveSync]);
  const runSyncAll = useCallback(async (allRepos: SourceControlRepository[]) => {
    if (!activeRef.current || syncAllBusy.current) return;
    syncAllBusy.current = true;
    setSyncState(prev => ({ ...prev, all: true }));
    const batchKeys = new Set<string>();
    const lanes = new Map<string, Promise<void>>();
    const runRepository = (repository: SourceControlRepository) => {
      const laneKey = repository.gitId || repository.id;
      const next = (lanes.get(laneKey) || Promise.resolve()).then(async () => {
        for (const worktree of repository.worktrees) {
          if (!mountedRef.current || !activeRef.current) break;
          const key = sourceControlWorktreeKey(repository.id, worktree.worktreeId);
          batchKeys.add(key);
          const reason = syncUnavailableReason(repository, worktree);
          if (reason) { saveSync({ repositoryId: repository.id, worktreeId: worktree.worktreeId, status: 'unavailable', message: reason }); continue; }
          if (syncInFlight.current.has(repository.id)) { saveSync({ repositoryId: repository.id, worktreeId: worktree.worktreeId, status: 'unavailable', message: '该代码库已有同步或其他 Git 写入进行中，本次跳过。' }); continue; }
          await runSync(repository, worktree);
        }
      });
      lanes.set(laneKey, next.catch(() => {}));
      return next;
    };
    try { await Promise.allSettled(allRepos.map(runRepository)); }
    finally {
      for (const key of batchKeys) {
        const result = latestSync.current[key];
        if (result && result.status !== 'succeeded') saveSync({ ...result });
      }
      syncAllBusy.current = false;
      if (mountedRef.current) setSyncState(prev => ({ ...prev, all: false }));
    }
  }, [runSync, saveSync]);

  // Worktree create / remove modal
  const [worktreeModal, setWorktreeModal] = useState<{
    action: 'create' | 'remove';
    repository: SourceControlRepository;
    worktree: SourceControlWorktree;
    context: WorktreeContext;
  } | null>(null);
  const [worktreeName, setWorktreeName] = useState('');
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [worktreeError, setWorktreeError] = useState('');
  const openWorktreeModal = useCallback(async (action: 'create' | 'remove', repository: SourceControlRepository, worktree: SourceControlWorktree) => {
    setWorktreeError('');
    try {
      const context = await requestForRef.current({ repositoryId: repository.id, checkoutId: worktree.worktreeId })<WorktreeContext>('worktree-context', {});
      const blocked = action === 'create' ? context.createReason : context.removeReason;
      if (blocked) { message.warning(blocked); return; }
      setWorktreeName('');
      setWorktreeModal({ action, repository, worktree, context });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '无法读取工作树状态。');
    }
  }, [message]);
  const submitWorktreeModal = async () => {
    if (!worktreeModal || worktreeBusy) return;
    if (worktreeModal.action === 'create' && !worktreeName.trim()) return;
    setWorktreeBusy(true); setWorktreeError('');
    try {
      const req = requestForRef.current({ repositoryId: worktreeModal.repository.id, checkoutId: worktreeModal.worktree.worktreeId });
      await req('worktree-write', {
        action: worktreeModal.action,
        expectedRevision: worktreeModal.context.revision,
        ...(worktreeModal.action === 'create' ? { name: worktreeName.trim() } : {}),
      });
      const removedSelected = worktreeModal.action === 'remove' && current?.checkoutId === worktreeModal.worktree.worktreeId;
      const fallback = worktreeModal.repository.worktrees.find(item => item.isMain) ?? worktreeModal.repository.worktrees[0];
      setWorktreeModal(null);
      await refreshRef.current();
      if (removedSelected && fallback) onSelectCheckout({ repositoryId: worktreeModal.repository.id, checkoutId: fallback.worktreeId });
      message.success(worktreeModal.action === 'create' ? '已新建工作树。' : '已移除工作树。');
    } catch (error) {
      setWorktreeError(error instanceof Error ? error.message : '工作树操作未完成。');
    } finally {
      setWorktreeBusy(false);
    }
  };

  // Branch extension (inline BranchManagementPopover, WorktreeMenu, Sync shortcut, HistoryFilters)
  const [ranges, setRanges] = useState<Record<string, { branchRef: string; authorEmail: string }>>({});
  const [busySources, setBusySources] = useState<Record<string, string>>({});
  const [openMenu, setOpenMenu] = useState('');
  const [branchRequest, setBranchRequest] = useState({ key: '', serial: 0 });
  const [selection, setSelection] = useState<SourceControlBranchExtension['selection']>();
  const selectionSerial = useRef(0);
  const repositoryBusy = (repositoryId: string) => Object.values(busySources).includes(repositoryId);
  const busyChanged = (source: string, repositoryId: string, value: boolean) => setBusySources(prev => {
    if (Boolean(prev[source]) === value) return prev;
    const next = { ...prev };
    if (value) next[source] = repositoryId; else delete next[source];
    return next;
  });
  const sourceKeyOf = (repository: SourceControlRepository, worktree: SourceControlWorktree) => JSON.stringify([workspaceId, sourceControlWorktreeKey(repository.id, worktree.worktreeId)]);
  const rangeOf = (repository: SourceControlRepository, worktree: SourceControlWorktree) => ranges[sourceKeyOf(repository, worktree)] || { branchRef: 'HEAD', authorEmail: '' };
  const openPosition = useCallback((repositoryId: string, worktreeId: string, nextScene: 'changes' | 'history') => {
    setSelection({ key: workspaceId + ':' + ++selectionSerial.current, repositoryId, worktreeId, scene: nextScene });
  }, [workspaceId]);
  useEffect(() => { setSelection(undefined); setOpenMenu(''); setBusySources({}); }, [workspaceId]);
  const syncingRepository = (repository: SourceControlRepository) => repository.worktrees.some(worktree => syncState.pending[sourceControlWorktreeKey(repository.id, worktree.worktreeId)]);

  const branchExtension: SourceControlBranchExtension = {
    readsSuspended: repositoryBusy,
    historyRange(repository, worktree) {
      const range = rangeOf(repository, worktree);
      return { branch: range.branchRef === 'HEAD' ? undefined : range.branchRef, authorEmail: range.authorEmail || undefined };
    },
    selection,
    viewChanges: (repositoryId, worktreeId) => openPosition(repositoryId, worktreeId, 'changes'),
    rowControl: (repository, worktree, ready, context) => {
      const key = sourceKeyOf(repository, worktree);
      return <DirectoryBranchControl key={JSON.stringify([workspaceId, repository.id, worktree.worktreeId])} workspaceId={workspaceId} repository={repository} worktree={worktree}
        version={repository.refsVersion || repository.readVersion || ''} ready={ready && !repository.cached && !syncingRepository(repository) && !repositoryBusy(repository.id)}
        inlineVisible={context.branchVisible} rowVisible={context.rowVisible} openRequest={branchRequest.key === key ? branchRequest.serial : 0}
        requestFor={requestFor}
        fetchState={{ pending: Boolean(fetchState.pending[repository.id]), result: fetchState.results[repository.id], fetchedAt: fetchState.successfulAt[JSON.stringify([repository.id, repository.gitId])] }}
        onFetch={() => runFetch([repository])}
        onBusy={value => busyChanged(key, repository.id, value)}
        onOpenPosition={worktreeId => openPosition(repository.id, worktreeId, 'history')}
        onViewChanges={() => openPosition(repository.id, worktree.worktreeId, 'changes')}
        onSwitched={() => refreshRef.current()} />;
    },
    rowActions: (repository, worktree, ready, context) => {
      const key = sourceKeyOf(repository, worktree);
      const available = ready && !repository.cached && worktree.status !== 'offline' && Boolean(repository.gitId && worktree.worktreeId);
      const unavailableReason = !available ? '当前来源尚未就绪，请刷新后重试' : syncUnavailableReason(repository, worktree);
      const extraItems = [
        { key: 'create-worktree', icon: <PlusOutlined aria-hidden />, label: '新建工作树', disabled: !ready || Boolean(fetchState.pending[repository.id]) || syncingRepository(repository) },
        ...(!worktree.isMain ? [{ key: 'remove-worktree', icon: <DeleteOutlined aria-hidden />, label: '移除工作树', danger: true, disabled: !ready || Boolean(fetchState.pending[repository.id]) || syncingRepository(repository) }] : []),
      ];
      return <SourceControlWorktreeMenu sourceKey={JSON.stringify([key, worktree.branch, worktree.head, worktree.upstream])} open={openMenu === key}
        onOpenChange={next => setOpenMenu(prev => next ? key : prev === key ? '' : prev)} repositoryName={codeRepositoryLabel(repository)} worktreeName={worktree.isMain ? '主工作树' : worktree.name}
        worktree={worktree} visible={context.rowVisible} popoverPlacement="leftTop" showTaskAction={false}
        ready={available} unavailableReason={unavailableReason} fetching={Boolean(fetchState.pending[repository.id])} syncing={syncingRepository(repository)}
        onManageBranch={() => setBranchRequest(prev => ({ key, serial: prev.serial + 1 }))}
        onFetch={() => { void runFetch([repository]); }}
        onSync={() => { void runSync(repository, worktree); }}
        extraItems={extraItems}
        onExtraAction={extraKey => {
          if (extraKey === 'create-worktree') void openWorktreeModal('create', repository, worktree);
          else if (extraKey === 'remove-worktree') void openWorktreeModal('remove', repository, worktree);
        }} />;
    },
    syncAction: (repository, worktree) => repository.cached ? undefined : ({
      pending: syncingRepository(repository) || Boolean(fetchState.pending[repository.id]),
      run: () => { if (!fetchState.pending[repository.id]) void runSync(repository, worktree); },
    }),
    historyControls(repository, worktree, controls) {
      const id = sourceKeyOf(repository, worktree), range = rangeOf(repository, worktree);
      return <DirectoryHistoryControls active={Boolean(controls.active && !repositoryBusy(repository.id))} key={id} repository={repository} worktree={worktree}
        version={repository.refsVersion || repository.readVersion || ''} {...range} query={controls.query} requestFor={requestFor}
        onBranchChange={branchRef => setRanges(prev => ({ ...prev, [id]: { ...range, branchRef } }))}
        onAuthorChange={authorEmail => setRanges(prev => ({ ...prev, [id]: { ...range, authorEmail } }))}
        onClear={() => { setRanges(prev => ({ ...prev, [id]: { branchRef: 'HEAD', authorEmail: '' } })); controls.clearSearch(); }} />;
    },
  };

  // Focus refresh
  useEffect(() => {
    if (!active) return;
    const onFocus = () => void refreshRef.current();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [active]);

  const readDiffEditableFile = useCallback(async (source: CodeDiffResponse['source'], filePath: string, signal: AbortSignal) => {
    const req = requestForRef.current(source.checkoutId ? { repositoryId: source.repositoryId, checkoutId: source.checkoutId } : null);
    const snapshot = await req<EditableFileSnapshot>('editor', { path: filePath }, signal);
    return directoryEditableDocument(workspaceId, snapshot);
  }, [workspaceId]);

  const targets = useMemo(() => explicitSelection ? [explicitSelection] : [], [explicitSelection?.repositoryId, explicitSelection?.checkoutId]);
  const fetching = Object.values(fetchState.pending).some(Boolean);
  const syncing = syncState.all || Object.values(syncState.pending).some(Boolean);
  const selectedRepositoryForModal = repositories.find(r => r.id === current?.repositoryId) ?? repositories[0];
  const selectedWorktreeForModal = selectedRepositoryForModal?.worktrees.find(w => w.worktreeId === current?.checkoutId)
    ?? selectedRepositoryForModal?.worktrees.find(w => w.isMain)
    ?? selectedRepositoryForModal?.worktrees[0];

  const worktreeStatusPending = catalog?.repositories.some(repo => repo.statusPending);
  const showInlineDiscoverMore = Boolean(catalog?.nextCursor && (!catalog?.registered || !repositories.length));
  const showMenuDiscoverMore = Boolean(catalog?.nextCursor && catalog?.registered && repositories.length > 0);
  const discoveryControl = showInlineDiscoverMore
    ? <div className="source-control-catalog-more"><Button size="small" type="link" loading={discoveringMore} disabled={discoveringMore} onClick={() => void discoverMore()}>查找更多仓库</Button></div>
    : !catalog?.nextCursor && catalog?.limited
      ? <p className="source-control-catalog-note">目录查找已达到本次范围，可能还有仓库未发现。</p>
      : null;
  if (!repositories.length && !catalogLoading && !catalog?.nextCursor) {
    return <Alert type="warning" showIcon message="源代码管理暂不可用" description={catalogError || catalog?.diagnostic || '当前目录不是 Git 代码库，也未发现嵌套代码库。'} action={<Button onClick={() => void refreshCatalog()}>重新读取</Button>} />;
  }

  return <div className="harness-directory-source-control" aria-label="源代码管理">
    <SourceControlOperationNotices workspaceId={workspaceId} repositories={repositories} fetchResults={fetchState.feedback} syncResults={syncState.results} onViewChanges={(repoId, wtId) => openPosition(repoId, wtId, 'changes')} />
    <SourceControlWorkbench
      sidebarOnRight
      active={active}
      repositories={repositories}
      defaultRepositories={defaultRepositories}
      scene={scene}
      reader={reader}
      readKey={scope.ref.id + ':' + scope.revision}
      observation={{
        loading: catalogLoading,
        error: catalogError,
        readAt: catalog?.readAt ?? '',
        diagnostics: [...(catalog?.diagnostic ? [catalog.diagnostic] : []), ...(catalog?.repositories.flatMap(repo => repo.error ? [`${codeRepositoryLabel({ name: repo.name, code: repo.code })}：${repo.error}`] : []) ?? [])],
        truncated: catalog?.truncated,
      }}
      currentSourceSelection={explicitSelection?.checkoutId ? { key: explicitSelection.checkoutId, targets, preferredTarget: targets[0] } : null}
      onCurrentSourceSelect={onSelectCheckout}
      onPrioritizeRepository={id => { const repository = catalog?.repositories.find(item => item.id === id); if (repository) prioritizeRepository(repository.path); }}
      catalogFeedback={<>{discoveryControl}{worktreeStatusPending && catalogLoading &&
        <p className="source-control-catalog-note" role="status">正在读取其余工作树…</p>}</>}
      onRefresh={() => refreshCatalog()}
      onRetry={() => refreshCatalog()}
      onScene={setScene}
      onOpenTask={noTask}
      onViewCurrent={onOpenCurrent}
      onOpenCurrentInExplorer={onOpenCurrent}
      onDiscard={(repository, worktree, file) => void discard.run(repository, worktree, file)}
      discardPending={discard.pending}
      liveReadsSuspended={(repository, worktree) => !!actions.state({workspaceId, repositoryId:repository.id, worktreeId:worktree.worktreeId, branch:worktree.branch}).gitPending}
      branchExtension={branchExtension}
      layoutStorageKey={'buildr:harness-scm:' + workspaceId}
      catalogActions={<Dropdown open={active && catalogMenuOpen} onOpenChange={setCatalogMenuOpen} trigger={['click']} placement="bottomRight" menu={{
        'aria-label': '源代码管理操作菜单',
        items: [
          { key: 'sync', icon: <SyncOutlined aria-hidden spin={syncing} />, label: syncing ? '正在同步…' : '全部同步', disabled: fetching || syncing || worktreeStatusPending || !repositories.length },
          { key: 'fetch', icon: <CloudDownloadOutlined aria-hidden spin={fetching} />, label: fetching ? '正在获取远程…' : '全部获取远程', disabled: fetching || syncing || !repositories.length },
          ...(showMenuDiscoverMore ? [
            { type: 'divider' as const },
            { key: 'discover-more', icon: <SearchOutlined aria-hidden />, label: discoveringMore ? '正在查找更多仓库…' : '查找更多仓库', disabled: discoveringMore || fetching || syncing },
          ] : []),
          ...(selectedRepositoryForModal && selectedWorktreeForModal ? [
            { type: 'divider' as const },
            { key: 'create-worktree', icon: <PlusOutlined aria-hidden />, label: '新建工作树', disabled: fetching || syncing },
          ] : []),
        ],
        onClick: ({ key }) => {
          setCatalogMenuOpen(false);
          if (key === 'sync') void runSyncAll(repositories);
          else if (key === 'fetch') void runFetch(repositories);
          else if (key === 'discover-more') void discoverMore();
          else if (key === 'create-worktree' && selectedRepositoryForModal && selectedWorktreeForModal) void openWorktreeModal('create', selectedRepositoryForModal, selectedWorktreeForModal);
        },
      }}><Button type="text" size="small" icon={<MoreOutlined rotate={90} />} loading={fetching || syncing || discoveringMore} aria-label="源代码管理操作菜单" title="源代码管理操作菜单" aria-expanded={catalogMenuOpen} aria-haspopup="menu" /></Dropdown>}
      renderChangeActions={(repository, worktree, panelVisible) => <SourceControlCommitPanel active={panelVisible} workspaceId={workspaceId} repository={repository} worktree={worktree} actions={actions} version={repository.readVersion || ''} modelCatalog={modelCatalog} modelsLoading={modelsLoading} modelError={modelError} />}
      fileEditing={{
        renderDiff: (diff, diffReader, mode) => <SourceControlDiffEditor workspaceId={workspaceId} diff={diff} reader={diffReader} mode={mode} editing={editing} active={active} readEditableFile={readDiffEditableFile} />,
        openFolder: target => requestForRef.current(target.worktreeId ? { repositoryId: target.repositoryId, checkoutId: target.worktreeId } : null)('open-folder', { path: target.path }),
      }}
    />
    {worktreeModal && <Modal
      open
      title={worktreeModal.action === 'create' ? '新建工作树' : '移除工作树'}
      okText={worktreeModal.action === 'create' ? '新建工作树' : '移除工作树'}
      okButtonProps={{ danger: worktreeModal.action === 'remove', disabled: worktreeBusy || (worktreeModal.action === 'create' && !worktreeName.trim()) }}
      cancelText="取消"
      confirmLoading={worktreeBusy}
      onCancel={() => { if (!worktreeBusy) setWorktreeModal(null); }}
      onOk={() => void submitWorktreeModal()}
    >
      <div className="harness-worktree-modal">
        <p>{worktreeModal.action === 'create'
          ? `在 ${worktreeModal.context.manager} 下以当前提交 ${worktreeModal.context.head?.slice(0, 12) || '—'} 新建工作树和同名本地分支。`
          : `移除 ${worktreeModal.context.location}；仅允许干净工作树，本地分支保留。`}</p>
        {worktreeModal.action === 'create' && <Input aria-label="新工作树与分支名" placeholder="输入工作树与分支名称" value={worktreeName} maxLength={80} onChange={event => setWorktreeName(event.target.value)} onPressEnter={() => void submitWorktreeModal()} />}
        {worktreeError && <Alert type="warning" showIcon message={worktreeError} />}
      </div>
    </Modal>}
  </div>;
}
