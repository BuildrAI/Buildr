# Buildr 公开 JSON 契约

Buildr 支持 `--json` 的命令在顶层提供 `schemaVersion`。它是输出格式的稳定身份，不是 Buildr package 版本；例如 doctor 使用 `buildr.doctor/v1`，runtime list 使用 `buildr.runtime-list/v1`。

## 兼容规则

- 同一个 `/v1` 内可以新增可选字段；消费者必须忽略不认识的字段。
- 已有字段的含义、类型、必填性或退出状态语义不能在同一个 schema version 内破坏性改变。
- 删除/重命名字段、改变字段类型或根结构时必须发布新的 major identity（例如 `/v2`），并在变更说明中给出迁移方式。
- 每个 command family 使用独立 identity，因此一个命令演进不会迫使所有 JSON 输出同时升级。
- `schemaVersion` 始终位于 JSON 根对象。脚本应先检查它，再解析所需字段。

当前 identity：

| 命令 family | schemaVersion |
|---|---|
| `version` | `buildr.version/v1` |
| 未知 CLI 路由错误 | `buildr.cli-error/v1` |
| `runtime list` | `buildr.runtime-list/v1` |
| `doctor` | `buildr.doctor/v1` |
| `commands check` | `buildr.commands-check/v1` |
| `component list` | `buildr.component-list/v1` |
| `component check` | `buildr.component-check/v1` |
| `builtin list` | `buildr.builtin-list/v1` |
| `update check` | `buildr.update-check/v1` |
| `openspec converge` | `buildr.openspec-convergence/v1` |
| `openspec audit` | `buildr.openspec-convergence-audit/v1` |
| `task environment prepare/inspect/cleanup` | `buildr.task-environment-result/v2` |
| `worktree create/inspect/cleanup` | `buildr.git-worktree-result/v1` |
| `verification run` | `buildr.verification-execution/v1` |
| `verification cleanup` | `buildr.verification-evidence-cleanup/v1` |
| `task create/inspect/update/complete/abandon` | `buildr.task-record-result/v3` |
| Local App Task stored detail/list query | `buildr.task-record-view/v1` / `buildr.task-record-list/v3` |
| `task verification inspect/record` | `buildr.task-verification-operation-result/v1` |
| `task finish run/inspect` | `buildr.task-finish-result/v2` |
| `app preview start/list/stop` | `buildr.local-app-preview/v1` |

Task Finish 的 v2 Result 是 SQLite terminal read model；current run、lease 和 cleanup-pending checkpoint 不通过旧 `.buildr/task-finish/runs`、`completed` 或 file lease 暴露，旧目录不被新 runtime 读取。完整命令诊断与 Carrier 只通过有界 transient locator 绑定，不能写入长期 Result。`task complete` 不是新的 JSON contract，而是 Task Record 的 terminal status。

`buildr.task-environment-result/v2` 统一返回 `operation`、`status`、Task ID、Receipt availability/locator、`current-machine`、`observedAt`、Environment read model、ready 时的 `execution` binding、diagnostic、effects 与 next actions。read model 除 scope 聚合 probes 外还包含 `dependencyRoots`，逐根公开 owner scope、root、package manager、manifest/lockfile identity、prepared identity、required、status、观察时间与诊断；`prepare` 本次真实安装通过 `dependency-root-prepared` effects 表达。`execution` 包含明确 workdir、execution/allowed roots、兼容的 Receipt 创建 controller fingerprint 与绝对 `cliInvocation`；该 fingerprint 不参与 ready、resource ownership 或 Verification applicability。read model 不暴露资源 cleanup handle 或 controller CLI 私有路径。`unavailable` 表示当前机器没有 Receipt；`blocked` 表示当前 probe、dependency drift、manager trust、provider/resource identity、占用或授权不满足；`cleaned` 保留最小处置摘要。

`buildr.git-worktree-result/v1` 只表达 `operation`、`status`、Task ID、Git evidence path、逐仓 source/checkout/branch/HEAD/clean/registration/state、精确 Git effects、diagnostic 与 next actions。它不包含 Environment ready、Runtime、CLI、依赖、projection、资源、恢复或总 cleanup 结论。

`buildr.verification-execution/v1` 返回显式 target identity、Project/declaration identity、实际选择的 command capabilities、逐项终态、可选 Task Environment execution binding、精确 capability/resource 授权、资源协调、真实 wall-clock、execution identity 与 transient evidence lifecycle。请求无效、能力失败或目标在执行中变化时仍输出同一单一 JSON envelope 并非零退出；worker stdout/stderr 只作为有界字段进入 checks，不与顶层 JSON 混排。它不是 portable Task Result，也不表达固定 assurance、推进决定或 Candidate generation。

`buildr.verification-evidence-cleanup/v1` 只报告 transient execution evidence 的 cleanup 状态。非 transient、identity 不匹配、目录越界或无法证明 provider ownership 的文件不会被删除。

`buildr.task-verification-operation-result/v1` 统一覆盖 current Result 的 `inspect|record`。成功时返回 `operation`、`status`、`taskId`、`slot`、`effects` 与 `nextActions`；`slot` 包含 path、present、完整 `buildr.task-verification-result/v1`、响应级 digest 和派生 applicability。没有 current Result 时 inspect 返回 `unknown`；target 或 declaration identity 变化时返回 `stale`。业务拒绝返回同一 envelope、`status: blocked`、稳定 diagnostic 和非零退出，且不得覆盖旧 slot。

`buildr.task-record-result/v3` 统一覆盖五个 Task Record 动作。成功时返回 `operation`、`status`、`taskId`、closed v1 `record`、响应级 `recordDigest`、直接关系摘要 `taskRelations`、`effects` 与 `nextActions`，不返回本地数据库路径；`diagnostic` 为 `null`。`record.parentTaskId` 是直接 Parent，`record.childTaskIds` 是按 ID 排序的直接 Children；`taskRelations.parent/children` 补充真实标题与状态，不递归展开。完整 Application 列表继续使用 `buildr.task-record-list/v2`。

Local App 普通观察路径使用独立 stored-state projection：详情 `buildr.task-record-view/v1` 与列表 `buildr.task-record-list/v3` 都来自同一 SQLite authority，返回 response-level `recordDigest`、stored Change references、直接关系与非持久化 `childTaskCount`，但不解析 Change availability、Environment、Development、Review、Verification 或 Finish currentness。列表 v3 另返回规范化 `filters`、从 Task scope rows 派生的 `filterOptions` 与用于区分“Workspace 无 Task/筛选无结果”的 `totalTaskCount`。业务拒绝仍返回现有 error envelope 或 action envelope，且不得产生 mutation effects。CLI 参数或路由语法错误继续使用 `buildr.cli-error/v1`。`recordDigest` 和 `childTaskCount` 都不进入 Task Record 持久 schema。

## Doctor v1 结果语义

`buildr.doctor/v1` 保留以下兼容关系：

- `ok`：没有 error；它不是 readiness，也不保证没有 warning。
- `workspace.identity.state`：`valid`、`incomplete` 或 `absent`；`workspace.initialized` 仅在 `valid` 时为 true。
- `health.workspaceValid`：canonical workspace identity 是否有效。
- `health.ready`：workspace 有效且没有 actionable warning/error。
- `health.actionRequired` / `actionableCount`：是否存在及共有多少条需要用户行动的 warning/error；`userActionRequired: false` 不计入。
- `summary.warning` 可以大于 0 且 `health.ready: true`：这表示 warning 仅披露可观测性或其他非行动型限制。消费者不得仅按 warning 数量推断需要修复，应读取 finding 的 `userActionRequired` 和顶层 `health`。
- `diagnosticProfile`：声明 `core`、`conditional`、`specialty` 三层检查边界，不表示专项检查已执行。
- `repairPlan`：按 blocking/required 排序、按共同动作或建议去重的修复步骤；`codes` 保留关联 findings。
- `nextSteps`：从 `repairPlan` 投影的兼容字段，新消费者应优先读取 `repairPlan`。

同一根因的下游检查可以延后。例如未登记 Project 只先报告 `projects.unregistered`；登记后再次运行 doctor，才继续检查 baseline 和 Service metadata。

人类可读的默认输出不受本契约约束。新增 JSON 命令时必须先登记 identity，并补充 checkout 与打包安装后的输出测试。
