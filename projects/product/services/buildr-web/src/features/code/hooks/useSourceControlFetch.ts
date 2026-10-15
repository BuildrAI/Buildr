import { useCallback, useEffect, useRef, useState } from 'react';
import { codeApi, type CodeFetchResponse } from '../api/code-api';
import { currentSourceControlFetchResults, subscribeSourceControlChanges } from '../source-control-events';
import type { SourceControlRepository } from '../source-control-model';

export type SourceControlFetchResult = CodeFetchResponse['repositories'][number];
export type SourceControlFetchActions = {
  pending: Record<string, boolean>; results: Record<string, SourceControlFetchResult>; feedback: Record<string, SourceControlFetchResult>;
  run(repositories: SourceControlRepository[]): Promise<void>;
};

export function useSourceControlFetch(workspaceId: string): SourceControlFetchActions {
  const [state, setState] = useState<{workspaceId:string; pending:Record<string, boolean>; results:Record<string, SourceControlFetchResult>; feedback:Record<string, SourceControlFetchResult>}>({workspaceId, pending:{}, results:{}, feedback:{}});
  const current = useRef(workspaceId); current.current = workspaceId;
  const inFlight = useRef(new Set<string>());
  useEffect(() => subscribeSourceControlChanges(notice => {
    if (notice.workspaceId !== workspaceId || current.current !== workspaceId || !notice.fetchResults) return;
    const results = currentSourceControlFetchResults(notice);
    if (!results.length) return;
    const external = results.filter(result => !inFlight.current.has(workspaceId + ':' + result.repositoryId));
    setState(previous => ({workspaceId, pending:previous.workspaceId === workspaceId ? previous.pending : {}, results:{...(previous.workspaceId === workspaceId ? previous.results : {}), ...Object.fromEntries(results.map(result => [result.repositoryId, result]))}, feedback:external.length ? Object.fromEntries(external.map(result => [result.repositoryId, result])) : previous.workspaceId === workspaceId ? previous.feedback : {}}));
  }), [workspaceId]);
  const run = useCallback(async (repositories: SourceControlRepository[]) => {
    const targets = [...new Map(repositories.map(repository => [repository.id, repository])).values()];
    if (!workspaceId || !targets.length || targets.some(repository => inFlight.current.has(workspaceId + ':' + repository.id))) return;
    for (const repository of targets) inFlight.current.add(workspaceId + ':' + repository.id);
    setState(previous => ({workspaceId, results:previous.workspaceId === workspaceId ? previous.results : {}, feedback:previous.workspaceId === workspaceId ? previous.feedback : {}, pending:{...(previous.workspaceId === workspaceId ? previous.pending : {}), ...Object.fromEntries(targets.map(repository => [repository.id, true]))}}));
    const outcomes: SourceControlFetchResult[] = [];
    try {
      // Each batch is an explicit subset of the observed click target; no registration reread expands it.
      for (let start = 0; start < targets.length; start += 128) {
        const batch = await codeApi.fetch(workspaceId, {repositories:targets.slice(start, start + 128).map(repository => ({repositoryId:repository.id, expectedGitId:repository.gitId || null, expectedCheckoutId:repository.checkoutId || null}))});
        outcomes.push(...batch.repositories);
      }
    } finally {
      for (const repository of targets) inFlight.current.delete(workspaceId + ':' + repository.id);
      if (current.current === workspaceId) setState(previous => {
        if (previous.workspaceId !== workspaceId) return previous;
        const pending = {...previous.pending}; for (const repository of targets) delete pending[repository.id];
        const currentResults = outcomes.filter(result => previous.results[result.repositoryId] === result);
        return {...previous, pending, feedback:currentResults.length ? Object.fromEntries(currentResults.map(result => [result.repositoryId, result])) : previous.feedback};
      });
    }
  }, [workspaceId]);
  return {pending:state.workspaceId === workspaceId ? state.pending : {}, results:state.workspaceId === workspaceId ? state.results : {}, feedback:state.workspaceId === workspaceId ? state.feedback : {}, run};
}
