import type { SourceControlReader, SourceControlRepository } from '../../features/code/source-control-model';
import type { CodeSourceControlInput } from '../../features/code/api/code-api';

/** Memory-only observations; this module imports no live client or request setup. */
export function densityReader(repositories:SourceControlRepository[]):SourceControlReader {
  const source = (input:CodeSourceControlInput, signal:AbortSignal) => {
    signal.throwIfAborted();
    const repository = repositories.find(item => item.id === input.repositoryId)!;
    const worktree = repository.worktrees.find(item => item.worktreeId === input.worktreeId)!;
    if (worktree.status === 'offline') throw Error('模拟目录当前不可读取。');
    return {repository, worktree, value:{repositoryId:repository.id, checkoutId:worktree.worktreeId, worktreeId:worktree.worktreeId, worktreeGroupId:worktree.isMain ? 'main' : 'demo-child', taskId:null, commitHash:input.commitHash || null, location:worktree.location, version:(input.commitHash || worktree.branch) + ' · 演示文件', kind:input.commitHash ? 'commit' as const : worktree.isMain ? 'default' as const : 'worktree' as const}};
  };
  const meta = {readAt:'2026-10-13T12:00:00.000Z', observedRevision:'demo-observation', coverage:{limit:1000,truncated:false,nextCursor:null},diagnostics:[]};
  const file = (input:CodeSourceControlInput, worktree:SourceControlRepository['worktrees'][number]) => {
    const result = worktree.changes.find(item => item.path === input.path) || worktree.commits.flatMap(item => item.files).find(item => item.path === input.path);
    if (!result) throw Error('模拟文件当前不可读取。'); return result;
  };
  return {
    history:async (input, signal) => { const current = source(input, signal); return {...meta,source:current.value, branches:[], commits:current.worktree.commits.map(commit => ({...commit,worktreeId:current.worktree.worktreeId,parents:[],taskId:commit.taskId || null,taskTitle:commit.taskTitle || null,taskDiagnostic:null}))}; },
    commit:async (input, signal) => {const current = source(input, signal), commit = current.worktree.commits.find(item => item.hash === input.commitHash)!; return {...meta,source:current.value,commit:{...commit,worktreeId:current.worktree.worktreeId,parents:[],taskId:null,taskTitle:null,taskDiagnostic:null},baseHash:null,files:commit.files.map(file => ({...file, worktreeId:current.worktree.worktreeId, area:'commit' as const}))};},
    diff:async (input, signal) => {const current = source(input, signal), value = file(input, current.worktree); return {...meta,source:current.value,area:input.area || value.area,file:{...value,worktreeId:current.worktree.worktreeId,area:input.area || value.area},patch:value.preview,binary:false,baseHash:null};},
    sourceFile:async (input, signal) => {const current = source(input, signal), value = file(input, current.worktree); return {...meta,source:current.value,path:value.path,kind:'text',content:value.content,mediaType:'text/plain',sizeBytes:value.content.length,limitBytes:1024*1024,truncated:false,digest:'sha256-' + 'a'.repeat(64),revision:'demo-file',page:null,observedAt:meta.readAt,message:''};},
  };
}
