## Why

Buildr Harness 当前的目录源代码管理与目录资源管理器在重构过程中引入了临时简化实现与展示缺陷，包括：
1. 在大型 Git 仓库（例如包含 `.worktrees` 与大量已追踪目录的工作区）中全量遍历目录会误触 `2048` 目录上限，错误提示“部分范围未能完整读取 · 代码库读取达到上限”。
2. 源代码管理目录树仅按单一选中工作树读取状态，其余工作树显示为未知状态（`☁️? 📄?`）；工作台顶部保留了冗余的工作树切换器；工作树操作与提交流程退化为平铺按钮和纯文本框，缺失行内分支管理、工作树菜单、操作通知、提交历史筛选、放弃更改确认、AI 提交说明生成、实时可编辑差异视图及提交/同步/推送组合操作。
3. 资源管理器右侧栏折叠条堆叠了失效的刷新与折叠图标，右侧栏切换时出现重复标签栏，且文件编辑退化为普通 `<textarea>`，缺少与源代码管理共享会话的 CodeMirror 6 编辑器、三方冲突解决、Markdown 预览与独立 HTML 预览。

按产品架构约束，通用的代码库发现、Git 读写、工作树操作、文件浏览与编辑能力必须由 `buildr-harness` / `buildr-harness-web` 统一提供，`buildr` / `buildr-web`（Development）仅在此基础上引用并扩展研发工程能力（登记仓库管理、任务范围与 `Buildr-Task:` 尾注、规则目录提示、项目文档协同等）。

## What Changes

- **后端通用能力上移至 `buildr-harness`**：将只读文件批次校验、代码提交上下文与提交执行、放弃更改、模型生成、提交材料整理与 AI 提交说明生成等通用能力沉淀到 `buildr-harness/src/workbench/` 并在 `workbench.ts` 导出；`buildr` 改为薄封装与透传。
- **修复并补齐目录工作台后端操作**：
  - 将 `observeDirectoryRepositories` 升级为 Git 感知的候选子目录扫描并跳过已登记工作树位置，避免在大型 Git 仓库内误触遍历上限。
  - 在 `directory-workbench` 中新增并接通 `catalog`（并发读取所有工作树实时状态）、`authors`、`history` 筛选（`branch` / `authorEmail`）、`branch-switch` 局部命名、批量 `fetch`、`commit-context`/`commit-changes`/`commit-push`、`commit-message`/`commit-message-run`/`commit-message-cancel`、`discard-context`/`discard-changes` 以及随文件读取返回的 `editorSnapshot`。
- **前端通用组件上移至 `buildr-harness-web` 并对齐交互细节**：
  - 将执行模型选择、通用文件编辑会话与编辑器（`FileEditingPane`、`FileDiffEditor` 等）、通用资源管理器外壳（`CodeTreePane`、`CodeExplorerNotices`）与源代码管理交互组件（`BranchManagementPopover`、`SourceControlCommitPanel`、`HistoryFilters`、`SourceControlWorktreeMenu`、`SourceControlDiffEditor`、`useSourceControlDiscard`、`SourceControlOperationNotices` 等）全部迁入 `buildr-harness-web`，保持 `host-boundaries` 零反向依赖；`buildr-web` 改为直接引用并扩展研发能力。
  - 完善右侧边栏布局支持（`SelectHoverCard` 与气泡向左弹出、`CodeTreePane` `side="right"`、`SourceControlWorkbench` 右侧宽度与交互细节），移除工作台顶部冗余切换器，消除资源管理器重复标签与冗余折叠按钮，接入统一会话编辑体验。

## Impact

- Affected services: `buildr-harness`, `buildr-harness-web`, `buildr`, `buildr-web`
- Affected specs: `harness-directory-workbench`
- Dependencies: `buildr-harness-web` 新增 `@codemirror/merge`（已在许可分发清单中批准）
