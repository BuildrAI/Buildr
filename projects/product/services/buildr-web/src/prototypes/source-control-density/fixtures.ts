import type { SourceControlChange, SourceControlCommit, SourceControlRepository, SourceControlWorktree } from '../../features/code/source-control-model';

const date = '2026-10-13T12:00:00.000Z';
const makeChanges = (repositoryId:string, worktreeId:string, count:number):SourceControlChange[] => Array.from({length:count}, (_, index) => ({repositoryId, worktreeId,
  path:index ? `src/feature-${index}.ts` : 'src/main.ts', area:index % 3 === 0 ? 'untracked' : 'unstaged', previousPath:null, kind:index % 3 === 0 ? 'untracked' : 'tracked', status:index % 3 === 0 ? 'untracked' : 'modified', additions:1, deletions:index % 3 === 0 ? 0 : 1,
  preview:index % 3 === 0 ? '@@ -0,0 +1 @@\n+export const ready = true;\n' : '@@ -1 +1 @@\n-export const ready = false;\n+export const ready = true;\n', previewTruncated:false, content:'export const ready = true;\n', previousContent:index % 3 === 0 ? '' : 'export const ready = false;\n'}));
type Sample = {id:string; name:string; branch:string; ahead:number|null; behind:number|null; files:number|null; upstream?:string|null; task?:boolean; unknown?:boolean; offline?:boolean; child?:Sample};
const samples:Sample[] = [
  {id:'base', name:'基础服务', branch:'dev', ahead:0, behind:0, files:0, child:{id:'base-task', name:'base', branch:'feature/aquatic-platform', ahead:0, behind:0, files:14, upstream:null, task:true}},
  {id:'common', name:'通用业务', branch:'dev-pigs', ahead:0, behind:0, files:0},
  {id:'office', name:'办公平台', branch:'dev', ahead:2, behind:0, files:3, task:true},
  {id:'open', name:'开放接口平台', branch:'dev-pigs', ahead:0, behind:12, files:123},
  {id:'touch', name:'触达服务', branch:'dev', ahead:0, behind:0, files:0, upstream:null},
  {id:'farm', name:'农牧后端业务服务', branch:'dev-nm', ahead:null, behind:null, files:null, unknown:true,
    child:{id:'farm-task', name:'freshx-nm', branch:'feature/aquatic-customer-platform', ahead:1, behind:0, files:41, task:true}},
  {id:'pigs', name:'生猪后端业务服务', branch:'dev-pigs', ahead:null, behind:null, files:null, offline:true},
];
export function densityRepositories(state = ''):SourceControlRepository[] {
  return samples.map(sample => {
    const tree = (item:Sample, main:boolean):SourceControlWorktree => {
      const worktreeId = 'demo-' + item.id, count = state === 'many-counts' && item.id === 'office' ? 321 : item.files;
      const changes = makeChanges(sample.id, worktreeId, count || 0);
      const task = item.task && state !== 'no-task';
      const commit:SourceControlCommit = {repositoryId:sample.id, worktreeId, hash:'a'.repeat(40), shortHash:'aaaaaaaa', subject:'完善当前服务的工作能力', message:'完善当前服务的工作能力\n\n这是一条模拟提交，用于对照目录和阅读交互。', authorName:'演示用户', authorEmail:'demo@example.com', authoredAt:date, committedAt:date, branches:[item.branch, 'dev'], tags:[], files:changes.slice(0, 2)};
      return {worktreeId, name:item.name, location:main ? `/演示工作空间/${sample.id}` : `/演示工作空间/${sample.id}/.worktrees/${item.name}`, isMain:main, isRegistered:main, branch:item.branch, head:commit.hash,
        ahead:state === 'many-counts' && item.id === 'office' ? 123 : item.ahead, behind:state === 'many-counts' && item.id === 'office' ? 45 : item.behind,
        upstream:item.upstream === undefined ? 'origin/' + item.branch : item.upstream, status:item.offline ? 'offline' : item.unknown ? 'partial' : count ? 'ready' : 'clean', fileCount:count, changes, commits:[commit], observedRevision:'demo:' + item.id, diagnostics:item.offline ? ['模拟目录当前不可读取。'] : [],
        taskId:task ? 'demo-' + sample.id : null, taskTitle:task ? (sample.id === 'farm' ? '农牧客户服务优化' : '优化服务工作能力') : null, taskDiagnostic:item.unknown ? '模拟任务证据尚未确认。' : null};
    };
    const main = tree(sample, true), worktrees = [main, ...(sample.child ? [tree(sample.child, false)] : [])];
    return {id:sample.id, name:sample.name, location:main.location, branch:main.branch, branches:[sample.branch, 'dev', 'main'], ahead:main.ahead, behind:main.behind,
      gitId:'demo-git:' + sample.id, checkoutId:main.worktreeId, status:main.status, simulated:false, services:[], worktrees, worktreeCount:worktrees.length,
      changes:main.changes, commits:main.commits, fileCount:main.fileCount, head:main.head, observedRevision:main.observedRevision};
  });
}
