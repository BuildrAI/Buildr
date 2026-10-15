import type { CodeSourceControlResponse } from './api/code-api';

export type SourceControlProgress = (value: CodeSourceControlResponse, phase: 'inventory' | 'repository') => void;
export type SourceControlLoader = (repositoryId: string | undefined, signal: AbortSignal, onProgress?: SourceControlProgress) => Promise<CodeSourceControlResponse>;
type Readers = {
  inventory(signal: AbortSignal): Promise<CodeSourceControlResponse>;
  repository(repositoryId: string, signal: AbortSignal): Promise<CodeSourceControlResponse>;
};

function failedRead(inventory: CodeSourceControlResponse, repositoryId: string, error: unknown, code = 'code_source_control_refresh_failed'): CodeSourceControlResponse {
  const diagnostic = {code, repositoryId, message:error instanceof Error ? error.message : '代码库当前不可读取。'};
  const repository = inventory.repositories.find(item => item.id === repositoryId)!;
  return {...inventory, readAt:new Date().toISOString(), repositories:[{...repository, diagnostics:[diagnostic]}], diagnostics:[diagnostic], selectedRepositoryIds:[], selectedWorktreeIds:[], selectedWorktrees:[]};
}

/** Discover once, then publish independent reads as they finish, with at most two requests in flight. */
export function createSourceControlRefreshLoader(readers: Readers): SourceControlLoader {
  return async (repositoryId, signal, onProgress) => {
    if (repositoryId) return readers.repository(repositoryId, signal);
    const inventory = await readers.inventory(signal);
    signal.throwIfAborted();
    onProgress?.(inventory, 'inventory');
    signal.throwIfAborted();
    const repositories = [...new Map(inventory.repositories.map(repository => [repository.id, repository])).values()];
    const completed = new Map<string, CodeSourceControlResponse>();
    const scheduled = repositories.slice(0, inventory.coverage.limit);
    for (const repository of repositories.slice(scheduled.length)) {
      signal.throwIfAborted();
      const value = failedRead(inventory, repository.id, new Error(`本次最多检查 ${inventory.coverage.limit} 个代码库，剩余状态尚未确认。`), 'code_source_control_read_limit');
      completed.set(repository.id, value);
      onProgress?.(value, 'repository');
    }
    let cursor = 0;
    const worker = async () => {
      while (cursor < scheduled.length) {
        signal.throwIfAborted();
        const repository = scheduled[cursor++];
        let value: CodeSourceControlResponse;
        try {
          value = await readers.repository(repository.id, signal);
          if (!value.repositories.some(item => item.id === repository.id)) throw new Error('代码库局部读取未返回对应来源。');
          value = {...value, repositories:value.repositories.filter(item => item.id === repository.id)};
        } catch (error) {
          signal.throwIfAborted();
          value = failedRead(inventory, repository.id, error);
        }
        signal.throwIfAborted();
        completed.set(repository.id, value);
        onProgress?.(value, 'repository');
      }
    };
    await Promise.all(Array.from({length:Math.min(2, scheduled.length)}, worker));
    signal.throwIfAborted();
    const values = repositories.map(repository => completed.get(repository.id)!);
    const observed = values.flatMap(value => value.repositories);
    const diagnostics = [...inventory.diagnostics.filter(item => item.code !== 'code_source_control_pending'), ...values.flatMap(value => value.diagnostics)];
    const worktreeCoverage = {...inventory.worktreeCoverage,
      total:observed.every(repository => repository.worktreeCount !== null) ? observed.reduce((sum, repository) => sum + repository.worktreeCount!, 0) : null,
      read:observed.reduce((sum, repository) => sum + repository.worktreeCoverage.read, 0),
      truncated:observed.some(repository => repository.worktreeCoverage.truncated),
    };
    return {...inventory, readAt:values.reduce((latest, value) => Date.parse(value.readAt) > Date.parse(latest) ? value.readAt : latest, inventory.readAt), repositories:observed,
      diagnostics:[...new Map(diagnostics.map(item => [JSON.stringify(item), item])).values()], worktreeCoverage,
      coverage:{...inventory.coverage, truncated:inventory.coverage.truncated || scheduled.length < repositories.length || worktreeCoverage.truncated || observed.some(repository => repository.worktrees.some(worktree => worktree.coverage.truncated))},
      selectedRepositoryIds:[...new Set([...inventory.selectedRepositoryIds, ...values.flatMap(value => value.selectedRepositoryIds)])],
      selectedWorktreeIds:[...new Set(values.flatMap(value => value.selectedWorktreeIds))],
      selectedWorktrees:[...new Map(values.flatMap(value => value.selectedWorktrees).map(worktree => [JSON.stringify([worktree.repositoryId, worktree.worktreeId]), worktree])).values()],
    };
  };
}
