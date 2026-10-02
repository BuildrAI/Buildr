import type { RepositoryPreviewFile } from '../../features/workspace/components/RepositoryFileBrowser';
import type { ChangedFileEntry } from '../../features/task/components/TaskChangedFiles';
import type { TaskCommit } from '../../features/task/components/task-commit-model';
import type { RailRepository } from '../../features/task/components/TaskDiffReader';
import { taskCommitKey } from '../../features/task/components/task-commit-model';
import { record as baseRecord, context as baseContext } from '../task-git-changes/fixtures';

declare const __SOURCE_FILES__: Array<RepositoryPreviewFile & { previousContent?: string }>;
export const files = __SOURCE_FILES__;
export const historicalFiles = files.map(file => ({ ...file, status: undefined, content: file.previousContent || file.content }));
export const sourcePath = 'projects/product/services/buildr-web/src/features/task/components/TaskDiffReader.tsx';
export const detailPath = 'projects/product/services/buildr-web/src/features/task/pages/TaskDetailPage.tsx';
export const browserPath = 'projects/product/services/buildr-web/src/features/workspace/components/RepositoryFileBrowser.tsx';
export const documentPath = 'projects/product/knowledge/docs/overview.md';
export const imagePath = 'docs/images/workspace-overview.png';
export const record = {
  ...baseRecord, taskId: 'repository-explorer', title: '为 Buildr 增加资源管理器',
  intent: '在 Buildr 中浏览完整文件、查看任务实际工作目录，并从改动直接进入完整文件。',
  createdAt: '2026-10-01T03:00:00Z', updatedAt: '2026-10-01T04:30:00Z',
};
export const context = { ...baseContext, progress: '正在体验文件浏览与任务审阅的呈现方式。', nextStep: '确认页面与关键交互后决定实施。', updatedAt: record.updatedAt };
export const repository = { id: 'mock-buildr', code: 'buildr', name: 'Buildr 源码库', description: 'Buildr 共用 Git 仓库，包含产品治理、后端与前端源码。' };
export const services = [
  { id: 'buildr', code: 'buildr', name: 'Buildr 后端', description: '命令、本机应用、运行与打包。', path: 'projects/product/services/buildr/package.json' },
  { id: 'buildr-web', code: 'buildr-web', name: 'Buildr 前端', description: 'Buildr Web 页面、交互与正式构建。', path: 'projects/product/services/buildr-web/package.json' },
  { id: 'dsh-plugin', code: 'dsh-plugin', name: 'Buildr DSH 插件', description: '独立桌面插件。', path: 'projects/product/services/dsh-plugin/package.json' },
];
function changed(path: string, preview: string, additions = 8): ChangedFileEntry {
  return { repositoryId: repository.id, path, kind: 'tracked', status: 'modified', previousPath: null, additions, deletions: 2, previewTruncated: false, preview };
}
export const changes = [
  changed(sourcePath, '@@ -178,6 +178,8 @@\n       <header className="task-diff-toolbar">\n         <div className="task-diff-actions">\n+          {current && owner && onOpenFile && (\n+            <Button onClick={() => onOpenFile(current, owner.repository, owner.commit)}>\n+              查看完整文件\n+            </Button>\n+          )}\n           <Button onClick={copyPath}>复制路径</Button>\n         </div>', 6),
  changed(detailPath, '@@ -145,5 +145,9 @@\n     <TaskDiffReader\n       repositories={repositories}\n       selected={selectedFile}\n+      onOpenFile={(file, repository, commit) => {\n+        openSourceFile({\n+          path: file.path, directory: repository.root, commit: commit?.commit.hash\n+        });\n+      }}\n     />', 5),
  { ...changed(browserPath, '@@ -0,0 +1,7 @@\n+import { useEffect, useMemo, useState } from "react";\n+import { Button, Input, Tree } from "antd";\n+\n+export function RepositoryFileBrowser(props) {\n+  const [query, setQuery] = useState("");\n+  return <section aria-label="资源管理器">文件与内容</section>;\n+}', 7), kind: 'untracked' as const, status: 'untracked' as const },
];
const commit: TaskCommit = {
  hash: 'a13c8f294d507b671e329ad704dd39128fc051b6', shortHash: 'a13c8f294d50',
  repositoryId: repository.id, subject: 'feat(task): 支持从改动进入完整文件',
  message: 'feat(task): 支持从改动进入完整文件\n\n保留当前查看位置，支持从审阅进入完整上下文。\n\nBuildr-Task: repository-explorer',
  authorName: 'chenjun', authorEmail: 'example@example.com',
  committedAt: '2026-10-01T02:30:00+08:00', authoredAt: '2026-10-01T02:30:00+08:00',
};
export const rail: RailRepository[] = [{
  id: repository.id, label: 'Buildr 源码库', root: '.worktrees/repository-explorer',
  branch: 'codex/repository-explorer', ahead: 1, status: 'complete',
  changes, commits: [{ key: taskCommitKey(commit), commit, files: [{ ...changes[0], repositoryId: repository.id + '@' + commit.hash }] }],
}];

export const sampleRepositories: Array<{ id: string; name: string; location: string; files: RepositoryPreviewFile[] }> = [
  { id: 'buildr', name: 'Buildr 源码库', location: 'Buildr / 代码库目录', files },
  { id: 'demo-web', name: '示例 Web 项目', location: 'repositories/demo-web', files: [
    { path: 'README.md', kind: 'markdown', content: '# 示例 Web 项目\n\n用于体验在同一工作空间切换代码库。\n\n- 页面入口：`src/App.tsx`\n- 展示数据只影响当前演示。\n' },
    { path: 'src/App.tsx', kind: 'text', content: 'import { useState } from "react";\n\nexport function App() {\n  const [filter, setFilter] = useState("");\n  return <main><h1>示例项目</h1><input value={filter} onChange={event => setFilter(event.target.value)} /></main>;\n}\n' },
    { path: 'package.json', kind: 'text', content: '{\n  "name": "demo-web",\n  "private": true\n}\n' },
  ] },
  { id: 'demo-api', name: '示例 API 项目', location: 'repositories/demo-api', files: [
    { path: 'README.md', kind: 'markdown', content: '# 示例 API 项目\n\n这里是独立代码库的完整文件示例。\n' },
    { path: 'src/routes.ts', kind: 'text', content: 'export const routes = [\n  { method: "GET", path: "/health" },\n  { method: "GET", path: "/items" },\n];\n' },
  ] },
];
export const defaultFiles = files.map(file => ({ ...file, status: undefined, content: file.previousContent || file.content }));
