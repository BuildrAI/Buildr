import { useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { codeApi } from '../api/code-api';
import { sourceControlRepository, type SourceControlReader, type SourceControlScopeSelection } from '../source-control-model';
import { createSourceControlCatalog, type SourceControlCatalogState } from '../source-control-catalog';
import { sourceControlReadDiagnostics } from '../source-control-summary';
import { createSourceControlRefreshLoader } from '../source-control-refresh';
import { WorkspaceSourceControlContext } from '../../../app/WorkspaceSourceControlProvider';

const emptySnapshot: SourceControlCatalogState = {data:null, loading:false, error:'', selectionReady:false, repositoryErrors:{}, versions:{}, refsVersions:{}};
const noSubscribe = () => () => {};
const emptyState = () => emptySnapshot;
const emptyWatchState = {diagnostics: [] as string[]};
const emptyWatch = () => emptyWatchState;
const noCheck = () => {};

export function useSourceControlSummary(workspaceId?: string | null) {
  const shared = useContext(WorkspaceSourceControlContext);
  const observer = shared && shared.workspaceId === workspaceId ? shared.observer : null;
  const catalog = observer?.catalog();
  const state = useSyncExternalStore(catalog?.subscribe || noSubscribe, catalog?.snapshot || emptyState);
  const watch = useSyncExternalStore(observer?.subscribe || noSubscribe, observer?.snapshot || emptyWatch);
  const updateDiagnostics = watch.diagnostics.filter(message => message.trim());
  const {readDiagnostics, failedRepositoryIds} = sourceControlReadDiagnostics(state);
  const retry = () => {
    if (failedRepositoryIds.length && !state.error.trim()) observer?.check(undefined, failedRepositoryIds);
    else observer?.reconcile();
  };
  return {data:state.data, versions:state.versions, check:observer?.reconcile || noCheck, retry, updateDiagnostics, readDiagnostics, diagnostics:[...updateDiagnostics, ...readDiagnostics],
    hasChanges:Boolean(state.data?.repositories.some(repository => repository.worktrees.some(worktree => (worktree.fileCount || 0) > 0)))};
}

/** The live adapter owns HTTP access; the shared workbench receives observations and replaceable readers. */
export function useSourceControl(workspaceId: string, taskId?: string, active = true) {
  const shared = useContext(WorkspaceSourceControlContext);
  const observer = shared && shared.workspaceId === workspaceId ? shared.observer : null;
  const catalog = useMemo(() => observer?.catalog(taskId) || createSourceControlCatalog(createSourceControlRefreshLoader({
    inventory:signal => codeApi.sourceControlInventory(workspaceId, {taskId}, signal),
    repository:(repositoryId, signal) => codeApi.sourceControl(workspaceId, {taskId, repositoryId}, signal),
  })), [workspaceId, taskId, observer]);
  const state = useSyncExternalStore(catalog.subscribe, catalog.snapshot);
  const completedSelection = useRef<{catalog: typeof catalog; value: Omit<SourceControlScopeSelection, 'key'>} | null>(null);
  // Selection readiness is independent of the foreground spinner: initial shared checks are silent.
  if (state.data && state.selectionReady) completedSelection.current = {catalog, value:{repositoryIds:state.data.selectedRepositoryIds, worktrees:state.data.selectedWorktrees, reason:state.data.scopeReason}};
  const watch = useSyncExternalStore(observer?.subscribe || noSubscribe, observer?.snapshot || emptyWatch);
  useEffect(() => {
    if (observer) return observer.retain(taskId);
    if (workspaceId) void catalog.refresh();
    return () => catalog.dispose();
  }, [workspaceId, taskId, catalog, observer]);
  useEffect(() => { if (active && observer) observer.reconcile(taskId); }, [active, observer, taskId]);
  const reader = useMemo<SourceControlReader>(() => ({
    history: (input, signal) => codeApi.history(workspaceId, input, signal),
    commit: (input, signal) => codeApi.commit(workspaceId, input, signal),
    diff: (input, signal) => codeApi.diff(workspaceId, input, signal),
    sourceFile: (input, signal) => codeApi.sourceFile(workspaceId, input, signal),
  }), [workspaceId]);
  const refresh = useMemo(() => observer ? (repositoryId?: string) => observer.refresh(repositoryId) : catalog.refresh, [observer, catalog]);
  const repositories = useMemo(() => state.data?.repositories.map(repository => ({...sourceControlRepository(repository), readVersion:String(state.versions[repository.id] || ''), refsVersion:String(state.refsVersions[repository.id] || ''),
    diagnostics:[...repository.diagnostics.filter(item => item.code !== 'code_source_control_pending').map(item => item.message), ...(state.repositoryErrors[repository.id] ? [state.repositoryErrors[repository.id]] : [])]})) || [], [state]);
  return { repositories, reader, readKey: workspaceId, selection: completedSelection.current?.catalog === catalog ? completedSelection.current.value : undefined, refresh,
    observation: { loading: state.loading, error: state.error, readAt: state.data?.readAt || '',
      diagnostics: [...watch.diagnostics, ...(state.data?.diagnostics.filter(item => item.code !== 'code_source_control_pending').map(item => item.message) || []), ...Object.entries(state.repositoryErrors).filter(([, error]) => error).map(([id, error]) => (state.data?.repositories.find(item => item.id === id)?.name || id) + '：' + error)], truncated: state.data?.coverage.truncated || false } };
}
