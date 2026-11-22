## Context

- `buildr-harness` 与 `buildr-harness-web` 是通用工作台底座，可在无研发项目登记时直接面对用户选定目录运行。
- `buildr` 与 `buildr-web` 是面向工程研发的上层实现，必须复用 Harness 通用底座并仅在其上叠加研发项目仓库清单、任务作用域、`Buildr-Task:` 尾注与工程规则发现，不能复制两套源代码管理或资源管理器 UI。
- 当前 Harness Web 的主机工作台将代码库、目录树等侧栏置于右侧（与左/中侧对话与画布配合），因此迁移共享组件时必须同时支持左置侧栏（Development）和右置侧栏（Harness）。

## Decisions

1. **Git 感知的目录代码库发现（`directory-checkouts.ts`）**
   - 当访问到 Git 根目录时，记录其全部成员工作树标准化路径到 `skipLocations`；不对其内部已追踪源码树和 `.worktrees` 执行全量 `fs.opendirSync`。
   - 通过 `git status --porcelain=v2 --ignored=matching --untracked-files=normal -z` 获取未追踪/被忽略的子目录与子仓库，再配合 `git ls-files --stage -z` 的 `160000` gitlink 条目发现嵌套子模块；仅对非 Git 目录继续执行普通目录枚举与 `maxDirectories` 保护。
   - 已被主仓库覆盖的工作树目录在队列出队或发现时直接跳过，避免重复登记和无效扫描。

2. **统一 `catalog` 与完整目录工作台操作（`directory-workbench.ts`）**
   - 新增 `catalog` 操作：发现目录下全部代码库后，分批并发为每个代码库的每个成员工作树采集实时 `observeSourceControlAsync` 与本地分支/领先落后/提交可用性状态，使目录树不再出现 `☁️? 📄?`。
   - 补齐 `authors`、`history`（`branch`/`authorEmail`）、`branch-switch`（`localName`）、批量 `fetch`、`commit-context`/`commit-changes`/`commit-push`、`commit-message` 系列生成与取消轮询、`discard-context`/`discard-changes`、以及单文件读取时的 `editorSnapshot`。
   - 独立目录模式的提交说明生成提供通用 `readDirectoryCommitGuidance`（读取工作空间根目录与当前工作树根下的 `AGENTS.override.md` / `AGENTS.md`），不依赖工程任务与服务登记；当存在 `Buildr-Task:` 尾注且无任务时由默认校验器拦截。

3. **前端模块边界与右侧边栏自适应（`buildr-harness-web` & `buildr-web`）**
   - 在 `buildr-harness-web` 中新增 `@codemirror/merge` (`6.12.2`)，将 `FileEditingContext`/`FileEditingSessionStore`/`FileEditingPane`/`FileDiffEditor` 迁入 `workbench/editor/`，确保 `DirectoryExplorer` 与 `DirectorySourceControl` 共享同一份未保存草稿、保护块状态与冲突处理。
   - `SourceControlCommitPanel` 通过抽象的 `CommitClient` / `ModelOption[]` 解耦外部 HTTP 与 Router 依赖，保留一键生成提交说明、单行自适应输入、提交/同步/推送组合操作和推送重试体验，不触犯 `host-boundaries.test.ts`。
   - 扩展 `SelectableHoverCard`、`SourceControlWorktreeStatus`、`BranchManagementPopover`、`CommitInfoPopover` 支持向左方向弹出，扩展 `CodeTreePane` 支持 `side="right"`，修复 `RepositoryFileBrowser` 折叠态不再显示冗余刷新图标与重复标签栏，移除 `HarnessDirectoryWorkbench` 顶部冗余的工作树切换栏。

## Risks / Trade-offs

- **并发采集性能**：工作树较多时逐个读取状态会增加首屏延迟。对策：按固定批次（每批 6 个）并发采集各工作树状态，单工作树异常仅标注该成员离线及诊断而不阻断整棵目录树。
- **边界测试门禁**：`buildr-harness-web/test/host-boundaries.test.ts` 禁止引用 `buildr-web`、`features/task`、`react-router-dom`。对策：全部 Harness 新增与迁移文件仅依赖 `buildr-harness-web` 内部上下文和显式注入回调，完成后立刻运行 `test:static` 与全量类型检查验证。
