import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { codeApi, type CodeSyncResponse } from '../api/code-api';
import { beginSourceControlSync, isCurrentSourceControlSync, notifySourceControlChange, subscribeSourceControlChanges } from '../source-control-events';
import { sourceControlWorktreeKey, type SourceControlRepository, type SourceControlWorktree } from '../source-control-model';

export type SourceControlSyncResult = {repositoryId:string; worktreeId:string; status:CodeSyncResponse['status']; message:string} & Partial<Pick<CodeSyncResponse, 'fetch' | 'rebase' | 'push'>>;
export type SourceControlSyncActions = {
  pending:Record<string, boolean>; results:Record<string, SourceControlSyncResult>;
  run(repository:SourceControlRepository, worktree:SourceControlWorktree):Promise<void>;
};

export function useSourceControlSync(workspaceId:string):SourceControlSyncActions {
  const [state, setState] = useState<{workspaceId:string; pending:Record<string, boolean>; results:Record<string, SourceControlSyncResult>}>({workspaceId, pending:{}, results:{}});
  const current = useRef(workspaceId); current.current = workspaceId;
  const viewActive = useContext(WorkspaceViewActiveContext);
  const active = useRef(viewActive); active.current = viewActive;
  const inFlight = useRef(new Set<string>());
  const mounted = useRef(false);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const save = useCallback((result:SourceControlSyncResult) => {
    if (!mounted.current || current.current !== workspaceId) return;
    setState(previous => ({workspaceId, pending:previous.workspaceId === workspaceId ? previous.pending : {}, results:{...(previous.workspaceId === workspaceId ? previous.results : {}), [sourceControlWorktreeKey(result.repositoryId, result.worktreeId)]:result}}));
  }, [workspaceId]);
  useEffect(() => subscribeSourceControlChanges(notice => {
    if (notice.workspaceId !== workspaceId || !isCurrentSourceControlSync(notice)) return;
    if (notice.syncResult) save({...notice.syncResult, repositoryId:notice.repositoryId, worktreeId:notice.worktreeId!});
    else if (notice.syncError) save({repositoryId:notice.repositoryId, worktreeId:notice.worktreeId!, status:'unknown', message:notice.syncError});
  }), [workspaceId, save]);
  const run = useCallback(async (repository:SourceControlRepository, worktree:SourceControlWorktree) => {
    const key = sourceControlWorktreeKey(repository.id, worktree.worktreeId), pendingKey = JSON.stringify([workspaceId, repository.id]);
    if (!workspaceId || !active.current || inFlight.current.has(pendingKey)) return;
    inFlight.current.add(pendingKey);
    const sequence = beginSourceControlSync(workspaceId, repository.id, worktree.worktreeId);
    const notice = {workspaceId, repositoryId:repository.id, worktreeId:worktree.worktreeId, syncSequence:sequence};
    setState(previous => {
      const results = {...(previous.workspaceId === workspaceId ? previous.results : {})}; delete results[key];
      return {workspaceId, results, pending:{...(previous.workspaceId === workspaceId ? previous.pending : {}), [key]:true}};
    });
    let issued = false;
    try {
      const input = {repositoryId:repository.id, worktreeId:worktree.worktreeId};
      const context = await codeApi.syncContext(workspaceId, input);
      if (context.source.repositoryId !== repository.id || context.source.worktreeId !== worktree.worktreeId || context.source.location !== worktree.location
        || context.branch !== worktree.branch || context.head !== (worktree.head || null) || context.target !== (worktree.upstream || null)) {
        throw new Error('来源、分支或提交已变化，请核对更新后的状态再同步。');
      }
      // Navigation during this read must not silently begin a write in a hidden page.
      if (!mounted.current || !active.current || current.current !== workspaceId || !isCurrentSourceControlSync(notice)) return;
      if (!context.available) {
        save({...input, status:'unavailable', message:context.reason || '当前来源暂不可同步。'});
        return;
      }
      issued = true;
      await codeApi.sync(workspaceId, {...input, expectedRevision:context.revision}, sequence);
    } catch (error) {
      if (!issued && isCurrentSourceControlSync(notice)) {
        save({repositoryId:repository.id, worktreeId:worktree.worktreeId, status:'failed', message:error instanceof Error ? error.message : '同步前读取失败，请重试。'});
        notifySourceControlChange({workspaceId, repositoryId:repository.id, worktreeId:worktree.worktreeId});
      }
      // Issued writes publish their own complete or unknown result, even after unmount.
    } finally {
      inFlight.current.delete(pendingKey);
      if (mounted.current && current.current === workspaceId) setState(previous => {
        if (previous.workspaceId !== workspaceId) return previous;
        const pending = {...previous.pending}; delete pending[key]; return {...previous, pending};
      });
    }
  }, [workspaceId, save]);
  return {pending:state.workspaceId === workspaceId ? state.pending : {}, results:state.workspaceId === workspaceId ? state.results : {}, run};
}
