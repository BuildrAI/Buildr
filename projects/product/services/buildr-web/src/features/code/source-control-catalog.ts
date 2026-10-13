import type { CodeBranchSwitchResponse, CodeSourceControlResponse } from './api/code-api';
import { sourceControlAfterBranchSwitch } from './source-control-branches.ts';

type Loader = (repositoryId: string | undefined, signal: AbortSignal) => Promise<CodeSourceControlResponse>;
function combinedCatalog(base: CodeSourceControlResponse, repositories: CodeSourceControlResponse['repositories'], diagnostics: CodeSourceControlResponse['diagnostics'], readAt: string): CodeSourceControlResponse {
  const worktreeCoverage = {...base.worktreeCoverage,
    total:repositories.every(repository => repository.worktreeCount !== null) ? repositories.reduce((total, repository) => total + repository.worktreeCount!, 0) : null,
    read:repositories.reduce((total, repository) => total + repository.worktreeCoverage.read, 0),
    truncated:repositories.some(repository => repository.worktreeCoverage.truncated),
  };
  return {...base, readAt, repositories, diagnostics, worktreeCoverage, coverage:{...base.coverage,
    truncated:worktreeCoverage.truncated || repositories.length > base.coverage.limit || repositories.some(repository => repository.worktrees.some(worktree => worktree.coverage.truncated)),
  }};
}
export type SourceControlCatalogState = {
  data: CodeSourceControlResponse | null; loading: boolean; error: string;
  repositoryErrors: Record<string, string>; versions: Record<string, number>;
};

/** One page owns its observations. Each repository has its own ordering boundary. */
export function createSourceControlCatalog(loader: Loader) {
  let state: SourceControlCatalogState = {data:null, loading:false, error:'', repositoryErrors:{}, versions:{}};
  let serial = 0, disposed = false;
  const latest = new Map<string, number>(), pending = new Map<string, AbortController>();
  const listeners = new Set<() => void>();
  const publish = (next: SourceControlCatalogState) => { state = next; for (const listener of listeners) listener(); };
  const refresh = async (repositoryId?: string, changed = false) => {
    if (disposed) return;
    // Until the first complete catalog exists there is nothing into which a partial result can merge.
    const target = state.data ? repositoryId : undefined, key = target || '', version = ++serial;
    pending.get(key)?.abort();
    const request = new AbortController(); pending.set(key, request);
    if (target) latest.set(target, version);
    else for (const repository of state.data?.repositories || []) latest.set(repository.id, version);
    publish({...state, loading:pending.has(''), error:target ? state.error : '', repositoryErrors:target ? {...state.repositoryErrors, [target]:''} : state.repositoryErrors});
    const current = () => !disposed && !request.signal.aborted && pending.get(key) === request;
    try {
      const value = await loader(target, request.signal);
      if (!current() || target && latest.get(target) !== version) return;
      const previous = state.data, versions = {...state.versions}, errors = {...state.repositoryErrors};
      const readAt = previous && Date.parse(previous.readAt) > Date.parse(value.readAt) ? previous.readAt : value.readAt;
      let data: CodeSourceControlResponse;
      if (target && previous) {
        const repository = value.repositories.find(item => item.id === target);
        if (!repository) throw new Error('代码库局部读取未返回对应来源。');
        data = combinedCatalog(previous, previous.repositories.map(item => item.id === target ? repository : item), [
          ...previous.diagnostics.filter(item => item.repositoryId !== target), ...value.diagnostics.filter(item => item.repositoryId === target),
        ], readAt);
        if (!changed) versions[target] = version;
        delete errors[target];
      } else {
        const retained = new Map(previous?.repositories.map(item => [item.id, item]) || []);
        const repositories = value.repositories.map(repository => {
          if ((latest.get(repository.id) || 0) > version) return retained.get(repository.id) || repository;
          if (!changed || versions[repository.id] === undefined) versions[repository.id] = version;
          delete errors[repository.id];
          return repository;
        });
        for (const repository of previous?.repositories || []) {
          if ((latest.get(repository.id) || 0) > version && !repositories.some(item => item.id === repository.id)) repositories.push(repository);
        }
        for (const id of Object.keys(errors)) if (!repositories.some(repository => repository.id === id)) delete errors[id];
        const protectedIds = new Set(repositories.filter(repository => (latest.get(repository.id) || 0) > version).map(repository => repository.id));
        data = combinedCatalog(value, repositories, [...value.diagnostics.filter(item => !item.repositoryId || !protectedIds.has(item.repositoryId)),
          ...(previous?.diagnostics.filter(item => item.repositoryId && protectedIds.has(item.repositoryId)) || []),
        ], readAt);
      }
      publish({...state, data, versions, repositoryErrors:errors});
    } catch (error) {
      if (!current() || target && latest.get(target) !== version) return;
      const message = error instanceof Error ? error.message : '当前代码库不可读取。';
      publish(target ? {...state, repositoryErrors:{...state.repositoryErrors, [target]:message}} : {...state, error:message});
    } finally {
      if (pending.get(key) === request) { pending.delete(key); if (!disposed) publish({...state, loading:pending.has('')}); }
    }
  };
  return {
    snapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
    changed(repositoryId: string, result?: CodeBranchSwitchResponse) {
      if (disposed) return;
      const version = ++serial; latest.set(repositoryId, version); pending.get(repositoryId)?.abort();
      const data = result && result.source.repositoryId === repositoryId && state.data ? sourceControlAfterBranchSwitch(state.data, result) : state.data;
      publish({...state, data, versions:{...state.versions, [repositoryId]:version}});
      void refresh(repositoryId, true);
    },
    changedMany(repositoryIds: string[]) {
      if (disposed || !repositoryIds.length) return;
      const version = ++serial, versions = {...state.versions};
      for (const id of repositoryIds) { latest.set(id, version); pending.get(id)?.abort(); versions[id] = version; }
      publish({...state, versions});
      void refresh(undefined, true);
    },
    dispose() { disposed = true; for (const request of pending.values()) request.abort(); pending.clear(); listeners.clear(); },
  };
}
