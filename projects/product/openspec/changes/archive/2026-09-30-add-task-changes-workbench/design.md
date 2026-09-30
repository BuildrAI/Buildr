## Context

任务详情页已有「任务需求/方案设计/开发实现/任务收尾」四个工作阶段标签和第五个「提交记录」阅读标签（`TaskWorkPath` 的 `contentTabs`）；后端已有 `task-record.commits` 只读接口（`/tasks/:taskId/commits`）与 `git-commit-reader`。本变更在既有结构与读取边界上扩展：同一观察面覆盖未提交改动与本任务提交，并把单次提交的文件改动纳入同一阅读面。已确认原型 (`task-git-changes` 任务原型) 定义了信息架构、布局与交互，本次实现以其为准。

## Goals / Non-Goals

**Goals:**
- 「改动与提交」单一内容标签：左栏仓库树（仓库分组 → 更改 + 提交），右栏差异面，各自独立滚动、占满高度；点文件即切差异，点提交展开文件列表。
- 差异面三视图：统一（默认）、并排（差异面 ≥~1000px 才可用）、全文；文件栏可拖宽（220–480px）、可收起、可堆叠到上方（<560px）。
- 「展开全屏」：任务模块内工作台脱离居中限宽铺满右屏，左栏折叠为边侧条、悬停弹出浮窗；「恢复分屏」复原。
- 后端只读读取：`git status --porcelain=v2`（含未跟踪）+ 按文件差异片段（含 `git diff --no-index` 取未跟踪全文）+ `git show --numstat/--patch` 按提交列文件；结果带读取时间、覆盖范围、完整性说明与局部诊断。
- 契约与 DTO 与既有 commits 模式一致：CLI 与网页同一只读结果；扩展 `task-http-schema.ts` 并由 `contracts:generate` 生成 DTO。

**Non-Goals:**
- 不执行 Git 写入：不暂存、不提交、不回滚、不 fetch；面板仅观察。
- 不新增工作阶段或任务状态：「改动与提交」是阅读面不是阶段；任务完成、审查、验证结论不受影响。
- 不改动提交关联判定与 `Buildr-Task` 尾注约定；不预设「展开全屏 + 浮窗」为右屏通用行为。
- 不提供完整在线 diff 编辑器、逐行批注或语法高亮；差异面为阅读面。

## Decisions

1. **一个内容标签承载两种观察**：未提交改动（工作区）与本任务提交（历史）在同一条观察线上，放在「任务收尾」之后与阶段并列；合并为「改动与提交」而不是两个标签，避免「变更」与 OpenSpec 术语冲突，也覆盖「改动前 → 改动后」。
2. **后端一次读取、前端一处消费**：新增 `task-record.changed-files`（`GET /tasks/:taskId/changed-files`）返回工作区改动与每条提交的摘要文件清单；详细差异片段随文件对象内联 `preview`（按行数上限截断），不建第三个 diff 专用接口，减少重复往返。扩展前端 `taskApi.changedFiles` 与 `useTaskChangedFiles`。
3. **DTO 契约演进而非新类型平行**：`changed-files` 响应独立 `buildr.task-changed-files/v1`；commits 响应不改版本、不改形状（兼容性），前端经 `repositoryMeta` 叠加分支/计数展示分组，不把视图数据塞回 commits 契约。
4. **统一视图优先、并排按宽度启用**：差异面 <1000px 统一、≥1000px 并排；纯重命名与已删除文件明示无差异，未跟踪文件全文按新增行展示——全部对应真实 Git 输出形态而非预览伪饰。
5. **文件栏复用 `ChangedFileList`**：工作区改动、提交内文件与浮窗共用同一文件行组件（`selectable` 模式用于导航选中），避免三套近似实现；提交行用紧凑 `task-rail-commit` 单独渲染，不复用 `TaskCommitRecords` 的展开面板。
6. **「展开全屏」任务模块先行**：驱动 `TaskDiffReader` 的 `fullscreen` prop 与页面 `is-wide` 版式切换，左栏折叠为 `task-diff-rail-peek` 浮窗；不触碰壳层 `pane-reading-toggle`，待本模块实践验证后再评估是否沉淀为右屏通用模式。

## Risks / Trade-offs

- **仓库数量与文件数上限**：多 worktree + 多提交时树很长；读取按 `repositoryLimit`、`fileLimit` 限制并标注 `truncated`，局部仓库不可达时 `partial` 保留已读结果。
- **差异片段体积**：按提交列文件含 preview 会放大响应；以行数上限截断 preview（如 200 行/文件），大文件靠「全文」视图按需再读——本变更不引入流式分页。
- **多仓库/多 worktree 身份**：沿用 `worktreeQuery.inspectGitWorktrees` 与任务范围解析判定真实仓库集合，不凭目录名猜测；只读观察不承诺可达性。
- **展开全屏的覆盖面积**：右屏满铺会盖住其他打开的页签阅读区，属于用户显式触发的临时布局，「恢复分屏」明确可逆。
- **实现与原型偏差**：原型为模拟数据与简化 diff；实现以真实 Git 输出为准，行号对齐、空 hunk、二进制与非文本文件按实际处理并在界面上如实说明。
