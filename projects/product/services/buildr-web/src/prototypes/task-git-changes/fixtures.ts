import type { TaskRecord, TaskCommitsResult } from '../../../build/generated/task-dto';
import type { TaskWorkContext } from '../../../build/generated/workbench-dto';
import type { TaskCommit } from '../../features/task/components/task-commit-model';
import { taskCommitKey } from '../../features/task/components/task-commit-model';
import type { ChangedFileEntry, TaskChangedFilesResult } from '../../features/task/components/TaskChangedFiles';

export const taskId = 'task-git-changes';
export const record: TaskRecord = {
  schemaVersion: 'buildr.task-record/v3', taskId, title: '任务中查看 Git 变更文件',
  intent: '在任务详情页内查看关联代码库尚未提交的改动，不用切到 IDE 的源代码管理面板确认本任务改动了哪些文件。',
  scope: { projects: ['product'], services: [{ project: 'product', service: 'buildr' }, { project: 'product', service: 'buildr-web' }] },
  changes: [], parentTaskId: null, retrospective: null, status: 'active', result: null,
  createdAt: '2026-09-30T01:00:00.000Z', updatedAt: '2026-09-30T08:10:00.000Z',
};
export const context: TaskWorkContext = {
  progress: '正在评审变更文件在任务页中的呈现方式。', nextStep: '确认落位与关键状态后决定实施。', updatedAt: record.updatedAt, attention: null, stage: 'design',
};

export const changedFiles: ChangedFileEntry[] = [
  {
    repositoryId: 'prototype-buildr', path: 'projects/product/services/buildr-web/src/features/task/components/TaskChangedFiles.tsx',
    kind: 'tracked', status: 'modified', previousPath: null, additions: 46, deletions: 3,
    previewTruncated: false, preview: '@@ -51,6 +51,14 @@ export function TaskWorkPath({\n   const nodes = taskPathNodes(record, context);\n   return <nav id="task-work-path">\n-    {contentTabs.map(tab => <Button …>)}</nav>\n+    {contentTabs.map(tab => (\n+      <Button key={`content:${tab.key}`}\n+        className={`task-work-tab${tab.selected ? " selected" : ""}`}\n+        data-task-content={tab.key}\n+        onClick={tab.onSelect}>{tab.label}</Button>\n+    ))}</nav>',
  },
  {
    repositoryId: 'prototype-buildr', path: 'projects/product/services/buildr-web/src/features/task/pages/TaskDetailPage.tsx',
    kind: 'tracked', status: 'modified', previousPath: null, additions: 12, deletions: 2,
    previewTruncated: false, preview: '@@ -128,7 +128,9 @@\n     <TaskWorkPath\n       record={record}\n       context={workContext.data?.context}\n-      contentTabs={[{ key: "commits", label: "提交记录" }]}\n+      contentTabs={[\n+        { key: "changes", label: "变更文件" },\n+        { key: "commits", label: "提交记录" },\n+      ]}\n     />',
  },
  {
    repositoryId: 'prototype-buildr', path: 'projects/product/services/buildr-web/src/features/task/components/task-changed-files.css',
    kind: 'untracked', status: 'untracked', previousPath: null, additions: 57, deletions: 0,
    previewTruncated: false, preview: '@@ -0,0 +1,8 @@ 未跟踪文件全文\n+.task-changed-files { min-width:0; color:var(--soft-ink); }\n+.task-changed-repo { margin:20px 0 26px; }\n+.task-changed-repo-head { display:flex; align-items:center; gap:10px; }\n+.task-changed-list { list-style:none; margin:0; padding:0; }\n+.task-changed-row { display:flex; align-items:center; gap:10px; }\n+.task-changed-status.status-modified { color:#c99011; }\n+.task-changed-status.status-untracked { color:#4f9e4f; }\n+.task-changed-diff .diff-add { background:#e7f4e7; }',
  },
  {
    repositoryId: 'prototype-buildr', path: 'projects/product/services/buildr-web/src/prototypes/task-git-changes/main.tsx',
    kind: 'untracked', status: 'untracked', previousPath: null, additions: 96, deletions: 0,
    previewTruncated: false, preview: '@@ -0,0 +1,6 @@ 未跟踪文件全文\n+import { useEffect, useRef, useState, type ReactNode } from "react";\n+import { createRoot } from "react-dom/client";\n+import { MemoryRouter } from "react-router-dom";\n+import { App, Button, ConfigProvider, Dropdown } from "antd";\n+import zhCN from "antd/locale/zh_CN";\n+import { AppShellHeader, AppShellFrame } from "../../app/AppShellView";',
  },
  {
    repositoryId: 'prototype-buildr', path: 'projects/product/services/buildr-web/src/prototypes/task-git-changes/fixtures.ts',
    kind: 'untracked', status: 'untracked', previousPath: null, additions: 119, deletions: 0,
    previewTruncated: false, preview: '@@ -0,0 +1,5 @@ 未跟踪文件全文\n+import type { TaskRecord, TaskCommitsResult } from "…/task-dto";\n+import type { TaskWorkContext } from "…/workbench-dto";\n+import { taskCommitKey } from "…/task-commit-model";\n+import type { ChangedFileEntry } from "…/TaskChangedFiles";\n+export const taskId = "task-git-changes";',
  },
  {
    repositoryId: 'prototype-buildr', path: 'projects/product/services/buildr-web/src/features/task/components/legacy-file-list.tsx',
    kind: 'tracked', status: 'deleted', previousPath: null, additions: null, deletions: null, previewTruncated: false, preview: null,
  },
];
export const changedFilesExtra: ChangedFileEntry[] = [
  {
    repositoryId: 'prototype-operation-trace', path: 'projects/product/openspec/changes/2026-09-26-buildr-operation-trace/specs/operation-trace/spec.md',
    kind: 'tracked', status: 'modified', previousPath: null, additions: 28, deletions: 4,
    previewTruncated: false, preview: '@@ -12,7 +12,9 @@\n ### Requirement: 操作记录查询\n 任务轨迹面板应列出关键操作。\n+#### Scenario: 按任务过滤\n+- **WHEN** 用户在任务页打开操作记录\n+- **THEN** 只显示该任务的轨迹\n #### Scenario: 空结果\n - **WHEN** 没有记录\n - **THEN** 显示引导文案',
  },
  {
    repositoryId: 'prototype-operation-trace', path: 'projects/product/openspec/changes/2026-09-26-buildr-operation-trace/specs/operation-trace/design.md',
    kind: 'tracked', status: 'modified', previousPath: null, additions: 17, deletions: 0,
    previewTruncated: false, preview: '@@ -30,4 +30,8 @@\n ## 阅读范围\n 面板只读展示，不承载写入操作。\n+\n+## 读取边界\n+- 未提交改动来自工作区状态读取\n+- 仓库不可达时保留其他仓库结果',
  },
  {
    repositoryId: 'prototype-operation-trace', path: 'projects/product/operation-trace-view.html',
    kind: 'untracked', status: 'untracked', previousPath: null, additions: 210, deletions: 0,
    previewTruncated: false, preview: '@@ -0,0 +1,7 @@ 未跟踪文件全文\n+<!doctype html>\n+<!-- buildr:ui-prototype -->\n+<html lang="zh-CN">\n+<head><title>操作记录视图 · 原型</title></head>\n+<body>\n+<div id="root"></div>\n+<script>/* 自包含原型 */</script>',
  },
  {
    repositoryId: 'prototype-operation-trace', path: 'projects/product/knowledge/docs/trace-vocabulary.md',
    kind: 'tracked', status: 'renamed', previousPath: 'projects/product/knowledge/docs/operation-vocabulary.md',
    additions: null, deletions: null, previewTruncated: false, preview: null,
  },
];
export const changedFilesResult: TaskChangedFilesResult = {
  schemaVersion: 'buildr.task-changed-files/v1', taskId, readAt: '2026-09-30T08:10:00Z', status: 'complete',
  repositories: [
    { id: 'prototype-buildr', label: 'Buildr', root: '/模拟工作空间/Buildr/.worktrees/task-git-changes', branch: 'codex/task-git-changes', ahead: 2, sources: ['worktree'], status: 'complete', fileCount: 6, scannedCommitCount: 4 },
    { id: 'prototype-operation-trace', label: 'Buildr · 操作记录', root: '/模拟工作空间/Buildr/.worktrees/2026-09-26-buildr-operation-trace', branch: 'codex/buildr-operation-trace', ahead: 1, sources: ['task-scope'], status: 'complete', fileCount: 4, scannedCommitCount: 3 },
  ],
  files: [...changedFiles, ...changedFilesExtra],
  commits: [],
  commitFiles: {},
  repositoryMeta: {},
  coverage: { repositoryLimit: 20, fileLimit: 500, commitFileLimit: 200, previewLineLimit: 240, truncated: false }, diagnostics: [], effects: [],
};

const commitExamples = [
  { hash: 'a13c8f294d507b671e329ad704dd39128fc051b6', subject: 'feat(task): 展示工作区变更文件', authorName: 'chenjun', committedAt: '2026-09-30 15:40', repositoryId: 'prototype-buildr', message: `feat(task): 展示工作区变更文件\n\n按仓库分组列出未提交的修改、新增与删除，\n展开文件查看差异预览。\n\nBuildr-Task: ${taskId}` },
  { hash: '8e2b14ca071d5fe90aab76c933d125608e71c42d', subject: 'feat(task): 在内容标签中登记变更文件入口', authorName: 'chenjun', committedAt: '2026-09-30 13:25', repositoryId: 'prototype-buildr', message: `feat(task): 在内容标签中登记变更文件入口\n\n变更文件与提交记录并列，位于任务收尾之后。\n\nBuildr-Task: ${taskId}` },
  { hash: '7f4a91c2d380be65e19a2c44d8f1a0b563c92e17', subject: 'docs(trace): 初版操作记录规范说明', authorName: 'chenjun', committedAt: '2026-09-29 17:02', repositoryId: 'prototype-operation-trace', message: `docs(trace): 初版操作记录规范说明\n\n记录操作面板的需求与查询边界。\n\nBuildr-Task: ${taskId}` },
];
export const commits: TaskCommit[] = commitExamples.map(commit => ({ ...commit, shortHash: commit.hash.slice(0, 12), authorEmail: 'example@example.com', committedAt: commit.committedAt.replace(' ', 'T') + ':00+08:00', authoredAt: commit.committedAt.replace(' ', 'T') + ':00+08:00' }));
const committedFiles: ChangedFileEntry[][] = [
  [
    {
      repositoryId: 'prototype-buildr', path: 'projects/product/services/buildr-web/src/features/task/components/TaskChangedFiles.tsx',
      kind: 'tracked', status: 'added', previousPath: null, additions: 142, deletions: 0,
      previewTruncated: false, preview: '@@ -0,0 +1,12 @@\n+import { App, Alert, Button, Spin } from "antd";\n+import { BranchesOutlined, … } from "@ant-design/icons";\n+import { formatShortDateTime } from "../../../lib/taskLabels";\n+import "./task-changed-files.css";\n+\n+export type ChangedFileStatus = …',
    },
    {
      repositoryId: 'prototype-buildr', path: 'projects/product/services/buildr-web/src/features/task/components/task-changed-files.css',
      kind: 'tracked', status: 'added', previousPath: null, additions: 57, deletions: 0,
      previewTruncated: false, preview: '@@ -0,0 +1,6 @@\n+.task-changed-files { min-width:0; color:var(--soft-ink); }\n+.task-changed-repo { margin:20px 0 26px; }\n+.task-changed-row { display:flex; … }',
    },
    {
      repositoryId: 'prototype-buildr', path: 'projects/product/services/buildr/src/modules/task/interfaces/http/task-http-schema.ts',
      kind: 'tracked', status: 'modified', previousPath: null, additions: 18, deletions: 0,
      previewTruncated: false, preview: '@@ -213,4 +213,12 @@\n   commitsRequest: schema(…),\n   commitsResponse: schema(…),\n+  changedFilesRequest: schema("changed-files/request", …),\n+  changedFilesResponse: schema("changed-files/response", …),\n   retrospectiveDocumentRequest: schema(…),',
    },
  ],
  [
    {
      repositoryId: 'prototype-buildr', path: 'projects/product/services/buildr-web/src/features/task/pages/TaskDetailPage.tsx',
      kind: 'tracked', status: 'modified', previousPath: null, additions: 12, deletions: 2,
      previewTruncated: false, preview: '@@ -128,7 +128,9 @@\n     <TaskWorkPath\n       record={record}\n       context={workContext.data?.context}\n-      contentTabs={[{ key: "commits", label: "提交记录" }]}\n+      contentTabs={[\n+        { key: "changes", label: "变更文件" },\n+        { key: "commits", label: "提交记录" },\n+      ]}\n     />',
    },
    {
      repositoryId: 'prototype-buildr', path: 'projects/product/services/buildr-web/src/features/task/components/TaskWorkPath.tsx',
      kind: 'tracked', status: 'modified', previousPath: null, additions: 9, deletions: 3,
      previewTruncated: false, preview: '@@ -14,7 +14,10 @@\n   {nodes.map(({ stage, current }) => …)}\n+  {contentTabs.map(tab => (\n+    <Button key={`content:${tab.key}`} …>{tab.label}</Button>\n+  ))}\n </nav>',
    },
  ],
  [
    {
      repositoryId: 'prototype-operation-trace', path: 'projects/product/openspec/changes/2026-09-26-buildr-operation-trace/specs/operation-trace/spec.md',
      kind: 'tracked', status: 'added', previousPath: null, additions: 84, deletions: 0,
      previewTruncated: false, preview: '@@ -0,0 +1,6 @@\n+# 操作记录（Operation Trace）\n+\n+## Purpose\n+任务轨迹面板为任务与外部动作建立可回查的记录。\n+\n+### Requirement: 操作记录查询',
    },
    {
      repositoryId: 'prototype-operation-trace', path: 'projects/product/openspec/changes/2026-09-26-buildr-operation-trace/proposal.md',
      kind: 'tracked', status: 'added', previousPath: null, additions: 32, deletions: 0,
      previewTruncated: false, preview: '@@ -0,0 +1,4 @@\n+# 设计 Buildr 操作记录与任务轨迹\n+\n+## Why\n+需要可回查的任务动作记录，支撑轨迹展示。',
    },
  ],
];
export const commitFiles: Record<string, ChangedFileEntry[]> = Object.fromEntries(commits.map((commit, index) => [taskCommitKey(commit), committedFiles[index] || []]));
export const repositoryMeta: Record<string, { branch?: string | null; ahead?: number | null }> = Object.fromEntries(
  changedFilesResult.repositories.map(repository => [repository.id, { branch: repository.branch, ahead: repository.ahead }]),
);
export const commitResult: TaskCommitsResult = {
  schemaVersion: 'buildr.task-commits/v1', taskId, readAt: '2026-09-30T08:10:00Z', status: 'complete', commits,
  repositories: [
    { id: 'prototype-buildr', label: 'Buildr', root: '/模拟工作空间/Buildr/.worktrees/task-git-changes', sources: ['worktree'], status: 'complete', scannedCommitCount: 12 },
    { id: 'prototype-operation-trace', label: 'Buildr · 操作记录', root: '/模拟工作空间/Buildr/.worktrees/2026-09-26-buildr-operation-trace', sources: ['task-scope'], status: 'complete', scannedCommitCount: 7 },
  ],
  coverage: { refs: ['HEAD'], repositoryLimit: 20, historyLimitPerRepository: 10000, commitLimit: 200, truncated: false }, diagnostics: [], effects: [],
};
