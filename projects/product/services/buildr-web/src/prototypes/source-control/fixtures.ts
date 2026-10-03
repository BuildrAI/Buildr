import type { SourceControlChange, SourceControlCommit, SourceControlRepository } from '../../features/code/components/SourceControlWorkbench';

export const sourceControlTaskId = 'code-source-control';
export const sourceControlTaskTitle = '实现源代码管理与任务变更、提交关联';
const webRoot = 'projects/product/services/buildr-web/src/';
const patch = (path: string, before: string[], after: string[]) => 'diff --git a/' + path + ' b/' + path + '\n--- a/' + path + '\n+++ b/' + path + '\n@@ -1,' + before.length + ' +1,' + after.length + ' @@\n' + before.map(line => '-' + line).join('\n') + '\n' + after.map(line => '+' + line).join('\n') + '\n';
function change(repositoryId: string, path: string, area: SourceControlChange['area'], before: string[], after: string[]): SourceControlChange {
  return { repositoryId, path, area, previousPath: null, kind: area === 'untracked' ? 'untracked' : 'tracked', status: area === 'untracked' ? 'untracked' : before.length ? 'modified' : 'added',
    additions: after.length, deletions: before.length, preview: patch(path, before, after), previewTruncated: false, content: after.join('\n') + '\n', previousContent: before.join('\n') + '\n' };
}
const buildrChanges: SourceControlChange[] = [
  change('buildr', webRoot + 'features/code/components/SourceControlWorkbench.tsx', 'unstaged', ['export function SourceControlWorkbench() {', '  return <p>源代码管理待建设</p>;', '}'], ['export function SourceControlWorkbench({ repositories }) {', '  const selected = repositories.filter(repository => repository.available);', '  return (', '    <section aria-label="源代码管理">', '      <RepositoryList repositories={repositories} />', '      <ChangeReader repositories={selected} />', '    </section>', '  );', '}']),
  change('buildr', webRoot + 'features/code/source-control.css', 'unstaged', ['.source-control { padding: 24px; }'], ['.source-control { display: flex; height: 100%; }', '.source-control-sidebar { width: 360px; flex: none; }', '.source-control-reader { flex: 1; min-width: 0; }']),
  change('buildr', webRoot + 'features/workbench/components/WorkbenchTaskRow.tsx', 'staged', ['<Link className="workbench-task-title">{record.title}</Link>'], ['<Link className="workbench-task-title">{record.title}</Link>', '{record.isParent && <span className="task-type-badge">组合任务</span>}']),
  change('buildr', webRoot + 'features/workbench/components/WorkbenchTaskRow.tsx', 'unstaged', ['{record.isParent && <span className="task-type-badge">组合任务</span>}'], ['{record.isParent && (', '  <span className="task-type-badge" aria-label="组合任务">组合任务</span>', ')}']),
  change('buildr', webRoot + 'prototypes/source-control/scenes.json', 'untracked', [], ['{', '  "version": 1,', '  "pages": ["changes", "history", "task-source"]', '}']),
];
const exampleChanges: SourceControlChange[] = [
  change('examples', 'src/WorkspaceExample.tsx', 'unstaged', ['export const repositories = ["Buildr"];'], ['export const repositories = [', '  "Buildr",', '  "examples",', '  "docs",', '];']),
  change('examples', 'README.md', 'staged', ['# Buildr 示例', '', '一个简单示例。'], ['# Buildr 示例', '', '展示多个代码库在同一工作空间中的协作。', '', '## 使用方式', '', '从代码区域查看文件、变更与历史。']),
];
function commit(repositoryId: string, digit: string, subject: string, day: number, files: SourceControlChange[], branches: string[], taskId?: string, tags: string[] = []): SourceControlCommit {
  const hash = digit.repeat(40).slice(0, 40);
  return { repositoryId, hash, shortHash: hash.slice(0, 8), subject, authorName: '陈俊', authorEmail: 'chenjun@example.com',
    authoredAt: '2026-10-' + String(day).padStart(2, '0') + 'T08:20:00+08:00', committedAt: '2026-10-' + String(day).padStart(2, '0') + 'T08:25:00+08:00',
    message: subject + '\n\n保留各代码库的独立身份、查看目录和当前结果。\n' + (taskId ? '\nBuildr-Task: ' + taskId : ''),
    files, branches, tags, ...(taskId ? { taskId, taskTitle: taskId === sourceControlTaskId ? sourceControlTaskTitle : '建设代码板块与代码查看能力' } : {}) };
}
const buildrCommits: SourceControlCommit[] = [
  commit('buildr', 'a1', 'feat(code): 展示代码库变更与历史', 2, buildrChanges.slice(0, 2), ['codex/code-source-control'], sourceControlTaskId),
  commit('buildr', 'b2', 'fix(workbench): 显示组合任务标记', 2, [buildrChanges[2]], ['dev'], sourceControlTaskId),
  commit('buildr', 'c3', 'feat(code): 增加完整文件浏览', 1, [buildrChanges[0]], ['dev'], 'code-workspace-explorer'),
  commit('buildr', 'd4', 'refactor(task): 统一改动与提交阅读', 1, [buildrChanges[1]], ['dev', 'main'], undefined, ['prototype-review']),
  commit('buildr', 'e5', 'docs(product): 补充代码库职责说明', 1, [change('buildr', 'projects/product/knowledge/docs/overview.md', 'staged', ['# Buildr', '', 'Buildr 管理工作资产。'], ['# Buildr', '', 'Buildr 管理工作资产。', '', '一个代码库可以被多个服务引用。'])], ['main']),
];
const repositorySamples: Array<Omit<SourceControlRepository, 'worktrees'>> = [
  { id: 'buildr', name: 'Buildr', location: '/Users/chenjun/workspaces/BuildrAI/Buildr', taskLocation: '/Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/code-source-control', taskBranch: 'codex/code-source-control', branch: 'dev', branches: ['dev', 'main', 'codex/code-source-control'], ahead: 2, behind: 0, status: 'ready', simulated: false, services: ['buildr', 'buildr-web', 'dsh-plugin'], changes: buildrChanges, taskChanges: buildrChanges.filter(file => file.area !== 'untracked'), commits: buildrCommits },
  { id: 'examples', name: 'examples', location: 'repositories/examples · 模拟登记目录', branch: 'main', branches: ['main', 'feature/multi-repository'], ahead: 1, behind: 2, status: 'ready', simulated: true, services: ['examples-web'], changes: exampleChanges,
    commits: [commit('examples', 'f6', 'feat(examples): 添加多代码库示例', 2, exampleChanges, ['main']), commit('examples', '17', 'docs(examples): 更新接入说明', 1, [exampleChanges[1]], ['main'], undefined, ['demo-v1'])] },
  { id: 'docs', name: 'docs', location: 'repositories/docs · 模拟登记目录', branch: 'main', branches: ['main'], ahead: 0, behind: 0, status: 'clean', simulated: true, services: ['docs-site'], changes: [],
    commits: [commit('docs', '28', 'docs: 更新工作空间使用说明', 2, [change('docs', 'guide/workspace.md', 'staged', ['# 工作空间'], ['# 工作空间', '', '在一个工作空间中查看所有已登记代码库。'])], ['main'])] },
  { id: 'integrations', name: 'integrations', location: 'repositories/integrations · 模拟目录暂不可读取', branch: 'develop', branches: ['develop', 'main'], ahead: 0, behind: 0, status: 'offline', simulated: true, services: ['integration-adapters'], changes: [],
    commits: [commit('integrations', '39', 'feat(adapter): 增加代码库适配示例', 2, [change('integrations', 'src/repositories.ts', 'staged', ['export const adapters = [];'], ['export const adapters = ["git"];'])], ['develop'])] },
];

// Explicit offline checkout identities; they never select a real local directory.
export const sourceControlRepositories: SourceControlRepository[] = repositorySamples.map(repository => {
  const makeWorktree = (worktreeId: string, name: string, location: string, isMain: boolean, branch: string | null, changes: SourceControlChange[], commits: SourceControlCommit[]) => {
    const files = changes.map(file => ({...file, worktreeId}));
    return {worktreeId, name, location, isMain, isRegistered: isMain, branch, ahead: repository.ahead, behind: repository.behind,
      status: repository.status, fileCount: repository.status === 'offline' ? null : new Set(files.map(file => file.path)).size, changes: files,
      commits: commits.map(commit => ({...commit, worktreeId, files: commit.files.map(file => ({...file, worktreeId}))})),
      observedRevision: 'scm:prototype-' + worktreeId, diagnostics: []};
  };
  const main = makeWorktree('mock-' + repository.id + '-main', repository.name, repository.location, true, repository.branch, repository.changes, repository.commits);
  const worktrees = [main];
  if (repository.id === 'buildr' || repository.id === 'examples') worktrees.push(makeWorktree('mock-' + repository.id + '-task', 'code-source-control', repository.taskLocation || repository.location + '/.worktrees/code-source-control', false, repository.taskBranch || 'feature/multi-repository', repository.taskChanges || repository.changes, repository.commits));
  return {...repository, worktrees, worktreeCount: worktrees.length, fileCount: worktrees.some(worktree => worktree.fileCount === null) ? null : worktrees.reduce((count, worktree) => count + worktree.fileCount!, 0)};
});
