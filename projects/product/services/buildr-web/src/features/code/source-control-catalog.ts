import type { CodeBranchSwitchResponse, CodeSourceControlResponse } from './api/code-api';
import { sourceControlAfterBranchSwitch } from './source-control-branches.ts';
import type { SourceControlLoader } from './source-control-refresh';

type Repository = CodeSourceControlResponse['repositories'][number];
const sameRepository = (previous: Repository | undefined, repository: Repository) => previous?.id === repository.id && previous.location === repository.location && (!previous.gitId || !repository.gitId || previous.gitId === repository.gitId);
function retainUnavailable(previous: Repository | undefined, repository: Repository): Repository {
  if (!previous || previous.id !== repository.id) return repository;
  // Failed discovery and client failures may carry declaration paths, not an observed Git root or identity.
  const unobserved = repository.status === 'unavailable' && !repository.gitId && !repository.source && repository.worktreeCount === null && !repository.worktrees.length;
  if (unobserved) repository = {...repository, location:previous.location, gitId:previous.gitId};
  if (!sameRepository(previous, repository)) return repository;
  const retained = new Set<string>();
  const stale = (worktree: Repository['worktrees'][number], before: Repository['worktrees'][number]) => {
    retained.add(before.worktreeId);
    return {...worktree, available:false, status:'unavailable' as const, source:before.source, changes:before.changes, fileCount:before.fileCount, observedRevision:before.observedRevision};
  };
  const worktrees = repository.status === 'unavailable' && repository.worktreeCount === null
    ? previous.worktrees.map(worktree => stale({...worktree, diagnostics:repository.diagnostics}, worktree))
    : repository.worktrees.map(worktree => {
      const before = previous.worktrees.find(item => item.worktreeId === worktree.worktreeId && item.location === worktree.location);
      return worktree.status === 'unavailable' && before ? stale(worktree, before) : worktree;
    });
  if (!retained.size) return repository;
  const primary = worktrees.find(worktree => worktree.isRegistered);
  return {...repository, gitId:repository.gitId || previous.gitId, worktrees, fileCount:worktrees.every(worktree => worktree.fileCount !== null) ? worktrees.reduce((sum, worktree) => sum + worktree.fileCount!, 0) : null,
    ...(primary ? {source:primary.source, changes:primary.changes, observedRevision:primary.observedRevision, branch:primary.branch, head:primary.head, upstream:primary.upstream, ahead:primary.ahead, behind:primary.behind} : {}),
    diagnostics:[...repository.diagnostics, {code:'code_source_control_stale', message:'更新失败，保留上次读取结果。', repositoryId:repository.id}]};
}
function selectedScope(base: CodeSourceControlResponse, repositoryIds: string[], worktrees: CodeSourceControlResponse['selectedWorktrees']) {
  const signature = (ids: string[], entries: CodeSourceControlResponse['selectedWorktrees']) => JSON.stringify([[...ids].sort(), entries.map(item => JSON.stringify([item.repositoryId, item.worktreeId])).sort()]);
  const changed = signature(repositoryIds, worktrees) !== signature(base.selectedRepositoryIds, base.selectedWorktrees);
  return {selectedRepositoryIds:repositoryIds, selectedWorktrees:worktrees, selectedWorktreeIds:[...new Set(worktrees.map(item => item.worktreeId))],
    scopeReason:!changed ? base.scopeReason : worktrees.length ? `按当前已确认范围预选 ${worktrees.length} 个检出，仍保留全部 Git 工作树`
      : repositoryIds.length ? '按当前已确认范围显示代码库，检出来源尚未确认。' : '当前没有可确认的预选来源，显示全部 Git 工作树。'};
}
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
export function createSourceControlCatalog(loader: SourceControlLoader) {
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
    publish({...state, loading:pending.has(''), error:target ? state.error : ''});
    const current = () => !disposed && !request.signal.aborted && pending.get(key) === request;
    const apply = (result: CodeSourceControlResponse, phase?: 'inventory' | 'repository') => {
      if (!current()) return;
      const previous = state.data;
      const readAt = previous && Date.parse(previous.readAt) > Date.parse(result.readAt) ? previous.readAt : result.readAt;
      if (phase === 'inventory') {
        const retained = new Map(previous?.repositories.map(repository => [repository.id, repository]) || []);
        const repositories = result.repositories.map(repository => {
          if ((latest.get(repository.id) || 0) <= version) latest.set(repository.id, version);
          // Declaration locations may be subdirectories or symbolic paths. Only a Git observation can prove a replacement.
          return retained.get(repository.id) || repository;
        });
        // Inventory is preliminary. Only the completed full refresh may remove old registrations.
        repositories.push(...(previous?.repositories.filter(repository => !repositories.some(item => item.id === repository.id)) || []));
        const diagnostics = [...result.diagnostics.filter(item => !item.repositoryId || !retained.has(item.repositoryId)), ...(previous?.diagnostics || [])];
        publish({...state, data:combinedCatalog(previous || result, repositories, [...new Map(diagnostics.map(item => [JSON.stringify(item), item])).values()], readAt)});
        return;
      }
      const partial = target || (phase === 'repository' ? result.repositories[0]?.id : undefined);
      if (partial && (latest.get(partial) || 0) > version) return;
      const repositories = result.repositories.map(repository => retainUnavailable(previous?.repositories.find(item => item.id === repository.id), repository));
      const value = {...result, repositories, diagnostics:[...result.diagnostics, ...repositories.flatMap(repository => (repository.diagnostics || []).filter(item => item.code === 'code_source_control_stale'))]};
      const versions = {...state.versions}, errors = {...state.repositoryErrors};
      const updateError = (repository: Repository) => {
        const failure = repository.diagnostics?.find(item => item.code === 'code_source_control_refresh_failed');
        if (failure) errors[repository.id] = failure.message;
        else delete errors[repository.id];
      };
      let data: CodeSourceControlResponse;
      if (partial && previous) {
        const repository = value.repositories.find(item => item.id === partial);
        if (!repository) throw new Error('代码库局部读取未返回对应来源。');
        const selectedWorktrees = [...previous.selectedWorktrees.filter(item => item.repositoryId !== partial), ...value.selectedWorktrees.filter(item => item.repositoryId === partial)];
        const selectedRepositoryIds = [...previous.selectedRepositoryIds.filter(id => id !== partial || value.selectedRepositoryIds.includes(id)), ...value.selectedRepositoryIds.filter(id => id === partial && !previous.selectedRepositoryIds.includes(id))];
        data = combinedCatalog({...previous, ...selectedScope(previous, selectedRepositoryIds, selectedWorktrees)}, previous.repositories.map(item => item.id === partial ? repository : item), [
          ...previous.diagnostics.filter(item => item.repositoryId !== partial), ...value.diagnostics.filter(item => item.repositoryId === partial),
        ], readAt);
        if (!changed) versions[partial] = version;
        updateError(repository);
      } else {
        const retained = new Map(previous?.repositories.map(item => [item.id, item]) || []);
        const repositories = value.repositories.map(repository => {
          if ((latest.get(repository.id) || 0) > version) return retained.get(repository.id) || repository;
          if (!changed || versions[repository.id] === undefined) versions[repository.id] = version;
          updateError(repository);
          return repository;
        });
        for (const repository of previous?.repositories || []) {
          if ((latest.get(repository.id) || 0) > version && !repositories.some(item => item.id === repository.id)) repositories.push(repository);
        }
        for (const id of Object.keys(errors)) if (!repositories.some(repository => repository.id === id)) delete errors[id];
        const protectedIds = new Set(repositories.filter(repository => (latest.get(repository.id) || 0) > version).map(repository => repository.id));
        const selectedRepositoryIds = [...value.selectedRepositoryIds.filter(id => !protectedIds.has(id)), ...(previous?.selectedRepositoryIds.filter(id => protectedIds.has(id)) || [])];
        const selectedWorktrees = [...value.selectedWorktrees.filter(item => !protectedIds.has(item.repositoryId)), ...(previous?.selectedWorktrees.filter(item => protectedIds.has(item.repositoryId)) || [])];
        data = combinedCatalog({...value, ...selectedScope(value, selectedRepositoryIds, selectedWorktrees)}, repositories, [...value.diagnostics.filter(item => !item.repositoryId || !protectedIds.has(item.repositoryId)),
          ...(previous?.diagnostics.filter(item => item.repositoryId && protectedIds.has(item.repositoryId)) || []),
        ], readAt);
      }
      publish({...state, data, versions, repositoryErrors:errors});
    };
    try {
      const value = await loader(target, request.signal, apply);
      apply(value);
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
