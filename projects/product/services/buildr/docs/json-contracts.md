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
| `openspec convergence inspect` | `buildr.openspec-convergence-inspect/v1` |
| `task environment prepare/inspect/cleanup` | `buildr.task-environment-result/v4` |
| `task environment plan record/inspect` | `buildr.task-environment-plan-result/v2` |
| `worktree create/inspect/cleanup` | `buildr.git-worktree-result/v1` |
| `verification run` | `buildr.verification-execution/v1` |
| `verification cleanup` | `buildr.verification-evidence-cleanup/v1` |
| `task create/inspect/update/activate/complete/abandon` | `buildr.task-record-result/v4` |
| `task parent inspect/record/bind-child/reconcile/accept` | `buildr.parent-coordination-result/v1` |
| Parent coordination嵌套值对象 | `buildr.parent-plan/v1` / `buildr.contribution-handoff/v1` |
| Local App Task stored detail/list query | `buildr.task-record-view/v2` / `buildr.task-record-list/v4` |
| `task verification inspect/record` | `buildr.task-verification-operation-result/v1` |
| Local App Task execution record list/detail/body file | `buildr.task-execution-record-list-view/v1` / `buildr.task-execution-record-detail-view/v1` / `buildr.task-execution-record-body-file/v1` |
| `task finish run/inspect` | `buildr.task-finish-result/v2` |
| `app preview start/list/stop` | `buildr.local-app-preview/v1` |

Task Finish 的 v2 Result 继续由SQLite current/terminal authority决定；`run` additive返回portable `executionRecord` operation summary，表达`not-opened|blocked|retained|attention`、record outcome/body大小与diagnostics transient cleanup，但不暴露SQLite、body/transient locator、Carrier路径或token。`inspect`不读取或列举records。每次真实run/resume独立保留受控diagnostics；record attention不改写已成立的delivery、cleanup、Task terminal或Finish status。Carrier、lease、resume和恢复资源仍只由Finish current管理。`task complete`不是新的JSON contract，而是Task Record terminal status。

`buildr.task-environment-result/v4`统一返回`operation`、`status`、Task ID、Receipt availability/locator、`current-machine`、`observedAt`、Environment read model、ready时的`execution`binding、diagnostic、effects与next actions。read model包含resolved Plan及逐Declaration/Scope/Recipe/Step current与prepared identity、inputs/outputs/required/executed/status/diagnostic；`preparation-step-executed`effect给出本次真实执行。`execution`包含明确workdir、execution/allowed roots与绝对`cliInvocation`。read model不暴露资源cleanup handle或controller CLI私有路径。

`buildr.task-environment-plan-result/v2`统一覆盖Plan`record|inspect`，返回saved Plan v2、Receipt locator、diagnostic、effects与next actions。`record`接收Plan Request，解析当前Task execution root中的Project Declaration，原子替换Plan并将Environment标为blocked但不执行Step；`inspect`只读saved current。

`buildr.git-worktree-result/v1` 只表达 `operation`、`status`、Task ID、Git evidence path、逐仓 source/checkout/branch/HEAD/clean/registration/state、精确 Git effects、diagnostic 与 next actions。它不包含 Environment ready、Runtime、CLI、依赖、projection、资源、恢复或总 cleanup 结论。

`buildr.verification-execution/v1` 返回显式 target identity、Project/declaration identity、实际选择的 command capabilities、逐项终态、可选 Task Environment execution binding、精确 capability/resource 授权、资源协调、真实 wall-clock、execution identity 与 transient evidence lifecycle。请求无效、能力失败或目标在执行中变化时仍输出同一单一 JSON envelope 并非零退出；worker stdout/stderr 只作为有界字段进入 checks，不与顶层 JSON 混排。它不是 portable Task Result，也不表达固定 assurance、推进决定或 Candidate generation。

`buildr.verification-evidence-cleanup/v1` 只报告 transient execution evidence 的 cleanup 状态。非 transient、identity 不匹配、目录越界或无法证明 provider ownership 的文件不会被删除。

`buildr.task-verification-operation-result/v1` 统一覆盖 current Result 的 `inspect|record`。成功时返回 `operation`、`status`、`taskId`、`slot`、`effects` 与 `nextActions`；`slot` 包含 path、present、完整 `buildr.task-verification-result/v1`、响应级 digest 和派生 applicability。没有 current Result 时 inspect 返回 `unknown`；target 或 declaration identity 变化时返回 `stale`。业务拒绝返回同一 envelope、`status: blocked`、稳定 diagnostic 和非零退出，且不得覆盖旧 slot。

当保存Result含Project或Service coverage gap时，`nextActions`按Project返回只读`declaration-intake`提示；它不改变Result schema、gap事实或writer authority，也不在inspect/record中写`verification.yml`。

`buildr.task-record-result/v4` 覆盖六个 Task Record 动作，返回 closed v2 `record`、`recordDigest`、Parent/Child `taskRelations`与复盘来源/后续 `retrospectiveRelations`。`record.retrospectiveSourceTaskIds` 只保存 source Task ID；关系摘要补充当前标题和状态。完整 Application 列表仍使用 `buildr.task-record-list/v2`。

`buildr.parent-coordination-result/v1`覆盖Parent coordination五个action。根对象返回operation/status/taskId、`legacy|parent-plan` mode、Parent status/Plan/final acceptance/Planning Review、直接Children及其planned binding和matching Contribution Handoff、按Contribution派生的disposition、blockers、final acceptance readiness、effects/diagnostic/nextActions。它只组合Task Record与Development/Review/Finish Applications已保存事实；Child状态和交付不复制进Parent Record/Plan，completed无matching handoff为`unproven`，最终验收不自动完成Parent。legacy Task返回absent diagnostic且不backfill。

Local App stored-state projection 使用详情 v2 和列表 v4，在既有字段上增加 `retrospectiveRelations`并支持 `open|todo|active|completed|abandoned|all`过滤。`open` 只是查询语义，不持久。这两个视图仍不解析专业 currentness，`recordDigest`、`childTaskCount` 与关系摘要都不进入 Task Record schema。

Task Execution Record 的三个 Local App read model 只读取同一 `task_execution_records` authority。list v1 固定支持 `all|verification|finish`，detail v1 返回 portable metadata 与经完整性验证的 closed正文文件清单，body-file v1 只返回单个白名单文件最多 512 KiB 的 UTF-8 preview 和双重截断状态。三者都不暴露 SQLite、locator、本机路径、reserved quota、resource token 或 mutation；cleaned tombstone 仍可列出，但正文读取返回 unavailable diagnostic。

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
