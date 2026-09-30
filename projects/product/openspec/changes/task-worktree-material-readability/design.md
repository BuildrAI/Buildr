# task-worktree-material-readability 设计

## 问题分解

三个相邻但可单独证明的缺陷：

1. **运行时端口缺口**：`createWebModule` 的组合对象只继承通用 runtime，`PreviewRuntime` 要求的 `assertCanonicalTaskWorkspace`、`inspectGitWorktrees`、`readGitWorktreeEvidence` 是 task/query 与 worktree provider 模块的 application 端口，从未接到 web 模块。`web preview start --task` 在第一行 task 分支就抛 `is not a function`。
2. **证据身份不匹配**：provider 的 `gitWorktreeEvidencePath`/`readGitWorktreeEvidence`/`inspectGitWorktrees` 用 `fs.realpathSync(target)` 与 evidence `workspaceRoot` 比对。target 为 linked worktree 时 realpath 指向工作树目录而非 canonical checkout，evidence 身份校验失败，`task_worktree_unavailable`/`git_worktree_inspect_failed` 向上冒成"任务工作树当前不可读取"。
3. **预览缺任务数据**：`--task` 预览以服务目标工作树为 workspace 读取 `.buildr/local/workspace.sqlite`，该目录属被忽略的本机现场，新建工作树为空——任务记录不可读，材料链路无从启动。

## 关键决策

### 1. web 模块补齐既有端口，不新建旁路

- `createWebModule` 的 `requires` 增加 `TASK_QUERY_APPLICATION` 与 `TASK_WORKTREE_PROVIDER`，把 `assertCanonicalTaskWorkspace`（query 端口）与 worktree provider 端口（`inspectGitWorktrees`、`readGitWorktreeEvidence`、`gitWorktreeEvidencePath`）并入 web composition。
- 复用既有 application 端口而不是直接 new provider：保持同一 evidence 校验、同一 canonical 语义、同一测试入口；web 模块不获得 task 写能力。
- `web preview stop --task` 的 caller 归一走同一条 `resolveTaskPreviewWorktree`，与 start 身份判定一致。

### 2. 在 provider 内归一 canonical 身份

- 新增内部归一：目标经 `observeGitCheckoutIdentity` 判断为 linked worktree（git-dir 位于 common-dir 的 `worktrees/` 子树）时，以 `dirname(gitCommonDirectory)` 的 canonical checkout 根作为 evidence `workspaceRoot` 基准；canonical 根与非 Git 目标保持原样。
- 归一放在 provider 的证据解析层（`gitWorktreeEvidencePath` 使用者之前的 `readGitWorktreeEvidence`/`currentRepositories`/`inspectGitWorktrees` 与 preview 的 `resolveTaskPreviewWorktree`），而非要求每个调用方先 canonicalize——`change-application`、`commits`、release binding 等既有调用方自动受益，不修改各自输入语义。
- `assertCanonicalTaskWorkspace` 不做归一：它服务 structured-store 读写语义，workspace 工作树副本 store 按 root 隔离的既有设计不改。

### 3. 启动时播种一致的 SQLite 副本

- `startPreview` 在 `--task` 分支解析出目标工作树后检查 `<worktree>/.buildr/local/workspace.sqlite`：存在则复用（复用即返回既有副本，不比较内容新旧）；缺失则以 canonical `<workspaceRoot>/.buildr/local/workspace.sqlite` 为源做一致副本。
- 一致副本使用 SQLite backup 语义（`VACUUM INTO` / `node:sqlite` 等价能力），避免在 canonical 有 WAL 写入时拷到半页；副本写入预览目标工作树的 `.buildr/local/`（该目录本来就是本机现场，不属于 Git 内容），不与 canonical 共享文件。
- canonical 库缺失或损坏：fail closed（`preview_task_store_unavailable`），不创建空库。
- 启动结果在 owner/result 中附加 `taskStore` 表达（`source: canonical|existing`、`seeded: true|false`），CLI 输出如实展示数据时点语义；不静默、不声称实时同步。
- 不在 startPreview 内做周期性刷新；需要更新副本时先停止预览，由调用方决定是否以 `--task` 重新启动复用。

### 4. 材料读取链路无需改接口

provider 归一后，`resolveTaskScopedChange`/`taskProjectDocument`/prototypes 对 target=worktree 的调用自然走到 `task-worktree-candidate` provenance；不回退保留目录冒充的边界由既有 `taskScopedProjectRoot` 的 fail-closed 分支继续保持。

## 失败边界

- 端口缺失之外的既有失败（evidence 损坏、checkout 漂移、project 工作树身份变化）保持原诊断码，不被归一吞掉。
- linked worktree 的 `.git` 指针损坏或 common-dir 不可解析：归一失败等同"无法证明 canonical 身份"，按缺证据类诊断处理，不猜测。
- 播种期间 canonical DB 被并发写：backup 语义保证副本一致；副本是时点快照的事实如实表达。

## 与相邻变更的关系

`internal-dev-preview-skill` 描述维护者如何使用本能力；本变更是产品侧修复，独立于技能存在。
