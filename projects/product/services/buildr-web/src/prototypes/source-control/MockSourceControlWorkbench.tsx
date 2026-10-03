import { useEffect, useMemo, useRef, useState } from 'react';
import { SourceControlWorkbench } from '../../features/code/components/SourceControlWorkbench';
import type { SourceControlChange, SourceControlFileTarget, SourceControlReader, SourceControlRepository, SourceControlScene, SourceControlState } from '../../features/code/source-control-model';
import type { CodeSourceControlInput, CodeHistoryResponse, CodeCommitResponse, CodeDiffResponse, CodeSourceFileResponse } from '../../features/code/api/code-api';
import { sourceControlTaskId, sourceControlTaskTitle } from './fixtures';

type Props = { repositories: SourceControlRepository[]; scene: SourceControlScene; state?: SourceControlState; onScene(scene: SourceControlScene, state?: SourceControlState): void; onOpenTask(taskId: string): void; onOpenFile?(target: SourceControlFileTarget): void };

/** Only this offline adapter fabricates observations; it imports no live client or request initialization. */
export function MockSourceControlWorkbench({ repositories, scene, state = '', onScene, onOpenTask, onOpenFile }: Props) {
  const [recovered, setRecovered] = useState<string[]>([]), [loading, setLoading] = useState(false);
  const [readAt, setReadAt] = useState('2026-10-02T17:15:00+08:00');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const observed = useMemo(() => state === 'empty' || state === 'loading' ? [] : repositories.map(repository => ({ ...repository,
    status: state === 'clean' || recovered.includes(repository.id) ? 'clean' as const : repository.status,
    ...(recovered.includes(repository.id) && repository.fileCount === null ? {fileCount: 0} : {}),
    ...(state === 'clean' ? { changes: [], taskChanges: [], commits: [], fileCount: 0 } : {}),
    worktrees: repository.worktrees.map(worktree => ({...worktree, status: state === 'clean' || recovered.includes(repository.id) ? 'clean' as const : worktree.status, ...(recovered.includes(repository.id) && worktree.fileCount === null ? {fileCount: 0} : {}), ...(state === 'clean' ? {changes: [], commits: [], fileCount: 0} : {})})),
    observedRevision: 'scm:prototype-' + repository.id,
  })), [repositories, state, recovered]);
  const reader = useMemo<SourceControlReader>(() => {
    const findRepository = (input: CodeSourceControlInput, signal: AbortSignal) => {
      signal.throwIfAborted();
      const repository = observed.find(item => item.id === input.repositoryId);
      if (!repository || repository.status === 'offline') throw Error('模拟代码库目录暂不可读取。');
      return repository;
    };
    const checkout = (repository: SourceControlRepository, input: CodeSourceControlInput) => repository.worktrees.find(worktree => worktree.worktreeId === input.worktreeId) || repository.worktrees[0];
    const source = (repository: SourceControlRepository, input: CodeSourceControlInput) => {
      const worktree = checkout(repository, input);
      return { repositoryId: repository.id, checkoutId: worktree.worktreeId, worktreeGroupId: worktree.isMain ? 'main' : 'mock-name:' + worktree.name, worktreeId: worktree.worktreeId, taskId: null, commitHash: input.commitHash || null,
        location: worktree.location, version: input.commitHash ? input.commitHash + ' · 历史文件' : worktree.branch + (input.area === 'staged' ? ' · 已暂存版本' : ' · 当前文件'),
        kind: input.commitHash ? 'commit' as const : worktree.isMain ? 'default' as const : 'worktree' as const };
    };
    const meta = (revision: string, limit = 100, truncated = false, nextCursor: string | null = null) => ({readAt, observedRevision: revision, diagnostics: [], coverage: {limit, truncated, nextCursor}});
    const commit = (repository: SourceControlRepository, hash: string, input: CodeSourceControlInput) => {
      const commits = checkout(repository, input).commits;
      const index = commits.findIndex(item => item.hash === hash), value = commits[index];
      if (!value) throw Error('模拟提交当前不可读取。');
      return {...value, worktreeId: checkout(repository, input).worktreeId, parents: commits[index + 1] ? [commits[index + 1].hash] : [], taskId: value.taskId || null, taskTitle: value.taskTitle || null, taskDiagnostic: null};
    };
    const currentFile = (repository: SourceControlRepository, input: CodeSourceControlInput): SourceControlChange => {
      const files = input.area === 'commit' && input.commitHash ? commit(repository, input.commitHash, input).files : checkout(repository, input).changes;
      const file = files.find(item => item.path === input.path && (input.area === 'commit' || item.area === input.area));
      if (!file) throw Error('模拟文件当前不可读取。');
      return file;
    };
    return {
      history: async (input, signal): Promise<CodeHistoryResponse> => {
        const repository = findRepository(input, signal), worktree = checkout(repository, input);
        const tip = input.branch ? worktree.commits.findIndex(item => item.branches.includes(input.branch!)) : 0;
        const reachable = input.branch ? tip < 0 ? [] : worktree.commits.slice(tip) : worktree.commits;
        const query = input.query?.trim().toLowerCase();
        const matches = reachable.filter(item => !query || [item.subject, item.authorName, item.hash, item.taskId].join(' ').toLowerCase().includes(query));
        const offset = Number(input.cursor || 0), limit = input.limit || 100;
        const values = matches.slice(offset, offset + limit), remaining = offset + limit < matches.length;
        return {...meta(checkout(repository, input).observedRevision || '', limit, remaining, remaining ? String(offset + limit) : null), source: source(repository, input), branches: repository.branches.map(name => ({name, hash: repository.commits.find(item => item.branches.includes(name))?.hash || repository.commits[0]?.hash || '', current: name === repository.branch, upstream: null})), commits: values.map(item => commit(repository, item.hash, input))};
      },
      commit: async (input, signal): Promise<CodeCommitResponse> => {
        const repository = findRepository(input, signal), value = commit(repository, input.commitHash || '', input);
        return {...meta('git:' + value.hash), source: source(repository, input), commit: value, baseHash: value.parents[0] || null, files: value.files.map(file => ({...file, worktreeId: checkout(repository, input).worktreeId, area: 'commit' as const}))};
      },
      diff: async (input, signal): Promise<CodeDiffResponse> => {
        const repository = findRepository(input, signal), file = currentFile(repository, input);
        const value = input.commitHash ? commit(repository, input.commitHash, input) : null;
        return {...meta(value ? 'git:' + value.hash : checkout(repository, input).observedRevision || ''), source: source(repository, input), area: input.area || 'unstaged', file: {...file, worktreeId: checkout(repository, input).worktreeId, area: input.area || file.area}, patch: file.preview, binary: false, baseHash: value?.parents[0] || null};
      },
      sourceFile: async (input, signal): Promise<CodeSourceFileResponse> => {
        const repository = findRepository(input, signal), file = currentFile(repository, input);
        const blob = 'f'.repeat(40), revision = input.area === 'staged' ? 'index:' + blob + ':100644' : input.commitHash ? 'git:' + input.commitHash + ':' + blob : 'current:prototype-' + checkout(repository, input).worktreeId + ':' + file.path;
        return {...meta(revision, 5 * 1024 * 1024), source: source(repository, input), path: file.path, kind: file.path.endsWith('.md') ? 'markdown' : 'text', content: file.content, mediaType: '', sizeBytes: new TextEncoder().encode(file.content).length, limitBytes: 5 * 1024 * 1024, truncated: false, digest: 'sha256-' + 'f'.repeat(64), revision, page: null, observedAt: readAt, message: ''};
      },
    };
  }, [observed, readAt]);
  const retry = (repositoryId?: string) => { setRecovered(ids => [...new Set([...ids, ...(repositoryId ? [repositoryId] : repositories.map(item => item.id))])]); setReadAt(new Date().toISOString()); onScene(scene, ''); };
  const refresh = () => new Promise<void>(resolve => {
    setLoading(true);
    timer.current = setTimeout(() => { setLoading(false); setReadAt(new Date().toISOString()); if (state === 'loading') onScene(scene, ''); resolve(); }, 500);
  });
  return <SourceControlWorkbench repositories={observed} scene={scene} reader={reader} readKey="offline-prototype"
    observation={{loading: loading || state === 'loading', error: state === 'failure' ? '模拟读取失败。' : '', readAt: state === 'loading' ? '' : readAt, diagnostics: state === 'partial' ? ['部分模拟代码库无法读取。'] : []}}
    onRefresh={refresh} onRetry={retry} onScene={next => onScene(next, state)} onOpenTask={onOpenTask} onOpenFile={onOpenFile}
    task={scene === 'task' ? {id: sourceControlTaskId, title: sourceControlTaskTitle} : undefined}
    scopeSelection={scene === 'task' ? {key: 'mock-task-entry', repositoryIds: ['buildr'], worktrees: [{repositoryId: 'buildr', worktreeId: 'mock-buildr-task'}], reason: '模拟任务的已确认工作树'} : undefined} onViewCurrent={() => onScene('changes', state)} />;
}
