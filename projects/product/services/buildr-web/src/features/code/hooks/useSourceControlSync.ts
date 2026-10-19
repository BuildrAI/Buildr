import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { codeApi, type CodeSyncResponse } from '../api/code-api';
import { beginSourceControlSync, isCurrentSourceControlSync, notifySourceControlChange, subscribeSourceControlChanges } from '../source-control-events';
import { sourceControlWorktreeKey, type SourceControlRepository, type SourceControlWorktree } from '../source-control-model';

export type SourceControlSyncResult = {repositoryId:string; worktreeId:string; status:CodeSyncResponse['status']; message:string} & Partial<Pick<CodeSyncResponse, 'fetch' | 'rebase' | 'push'>>;
export type SourceControlSyncActions = {
  pending:Record<string, boolean>; results:Record<string, SourceControlSyncResult>; runningAll:boolean;
  run(repository:SourceControlRepository, worktree:SourceControlWorktree):Promise<void>;
  runAll(repositories:SourceControlRepository[]):Promise<void>;
};
/** Mirrors the per-row sync eligibility of useSourceControlBranches; skipped items keep the same real reason. */
export function sourceControlSyncUnavailableReason(repository:SourceControlRepository, worktree:SourceControlWorktree): string | undefined {
  if (!repository.gitId || !repository.checkoutId || repository.status === 'offline' || worktree.status === 'offline') return '当前来源尚未就绪，请刷新后重试';
  if (!worktree.branch) return '当前工作树没有可同步的本地分支';
  if (!worktree.head) return '当前分支还没有提交';
  if (worktree.upstream === null) return '当前分支未设置远端跟踪分支';
  if (!worktree.upstream) return '尚未确认当前分支的远端跟踪关系，请刷新后重试';
  return undefined;
}

export function useSourceControlSync(workspaceId:string):SourceControlSyncActions {
  const [state, setState] = useState<{workspaceId:string; pending:Record<string, boolean>; results:Record<string, SourceControlSyncResult>; all:boolean}>({workspaceId, pending:{}, results:{}, all:false});
  const current = useRef(workspaceId); current.current = workspaceId;
  const viewActive = useContext(WorkspaceViewActiveContext);
  const active = useRef(viewActive); active.current = viewActive;
  const inFlight = useRef(new Set<string>());
  const runningAll = useRef(false);
  const mounted = useRef(false);
  const latest = useRef<Record<string, SourceControlSyncResult>>({});
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => {latest.current = {};}, [workspaceId]);
  const save = useCallback((result:SourceControlSyncResult) => {
    latest.current[sourceControlWorktreeKey(result.repositoryId, result.worktreeId)] = result;
    if (!mounted.current || current.current !== workspaceId) return;
    setState(previous => ({...previous, workspaceId, pending:previous.workspaceId === workspaceId ? previous.pending : {}, results:{...(previous.workspaceId === workspaceId ? previous.results : {}), [sourceControlWorktreeKey(result.repositoryId, result.worktreeId)]:result}}));
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
    delete latest.current[key];
    setState(previous => {
      const results = {...(previous.workspaceId === workspaceId ? previous.results : {})}; delete results[key];
      return {...previous, workspaceId, results, pending:{...(previous.workspaceId === workspaceId ? previous.pending : {}), [key]:true}};
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
  const runAll = useCallback(async (repositories:SourceControlRepository[]) => {
    if (!workspaceId || !active.current || runningAll.current) return;
    runningAll.current = true;
    setState(previous => previous.workspaceId === workspaceId ? {...previous, all:true} : previous);
    const batchKeys = new Set<string>();
    try {
      for (const repository of repositories) {
        if (!mounted.current || !active.current || current.current !== workspaceId) break;
        for (const worktree of repository.worktrees) {
          if (!mounted.current || !active.current || current.current !== workspaceId) break;
          const key = sourceControlWorktreeKey(repository.id, worktree.worktreeId); batchKeys.add(key);
          const reason = sourceControlSyncUnavailableReason(repository, worktree);
          if (reason) { save({repositoryId:repository.id, worktreeId:worktree.worktreeId, status:'unavailable', message:reason}); continue; }
          if (inFlight.current.has(JSON.stringify([workspaceId, repository.id]))) { save({repositoryId:repository.id, worktreeId:worktree.worktreeId, status:'unavailable', message:'该代码库已有同步或其他 Git 写入进行中，本次跳过。'}); continue; }
          await run(repository, worktree);
        }
      }
    } finally {
      // A later success would close an earlier failure notice; re-surface every non-succeeded result of this batch once at the end.
      for (const key of batchKeys) {
        const result = latest.current[key];
        if (result && result.status !== 'succeeded') save({...result});
      }
      runningAll.current = false;
      if (mounted.current && current.current === workspaceId) setState(previous => previous.workspaceId === workspaceId ? {...previous, all:false} : previous);
    }
  }, [workspaceId, run, save]);
  return {pending:state.workspaceId === workspaceId ? state.pending : {}, results:state.workspaceId === workspaceId ? state.results : {}, runningAll:state.workspaceId === workspaceId && state.all, run, runAll};
}
