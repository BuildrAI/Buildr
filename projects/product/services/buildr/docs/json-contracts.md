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
| `worktree create/inspect/cleanup` | `buildr.git-worktree-result/v1` |
| 长流程缺省compact（release transaction、self-bootstrap） | `buildr.long-running-operation-summary/v1` |
| `__internal task-retrospective list` | `buildr.task-retrospective-list-result/v1` |
| `task create/inspect/update/activate/complete/abandon` | `buildr.task-record-result/v4` |
| `task parent inspect/record/bind-child/reconcile/accept` | `buildr.parent-coordination-result/v3` |
| Parent coordination嵌套值对象 | `buildr.parent-plan/v2`（v1只读兼容）/ `buildr.contribution-handoff/v1` |
| Buildr Web Task stored detail/list query | `buildr.task-record-view/v2` / `buildr.task-record-list/v4` |
| `task verification inspect/record` | `buildr.task-verification-operation-result/v1` |
| `task finish run/inspect`（缺省或`--detail compact`） | `buildr.task-finish-compact-result/v1` |
| `task finish run/inspect --detail full` | `buildr.task-finish-result/v2` |
| `web preview start/list/stop` | `buildr.local-app-preview/v1` |

Task Finish的canonical Result由SQLite current/terminal authority决定；CLI只在JSON输出边界选择detail。缺省或显式`compact`返回closed投影，只保留Task/run/status、主失败、next action、关键refs、delivery/completion disposition与timing，不包含Task Execution Record摘要。

`buildr.git-worktree-result/v1` 只表达 `operation`、`status`、Task ID、Git evidence path、逐仓 source/checkout/branch/HEAD/clean/registration/state、精确 Git effects、diagnostic 与 next actions。它不包含 Environment ready、Runtime、CLI、依赖、projection、资源、恢复或总 cleanup 结论。

`buildr.long-running-operation-summary/v1`是closed、最多16384 UTF-8字节的只读投影，固定表达operation、compact detail、terminal/status、Task/run/result identity、至多12个关键阶段、primary failure、cleanup、output boundary与至多一个结构化recovery pointer。它不包含完整checks/context/evidence/operations/effects/diagnostics、stdout/stderr、本机路径、raw argv、secret、lease、resume token或正文，也不成为新的Result authority。展示截断与execution failure正交；收到`running`、stdout丢失或等待超时时，consumer先按pointer回读同一owner，不默认重跑。

`buildr.project-verification-result/v1`返回Project测试地图的operation、status、path、identity、规范化declaration、errors和effects。`buildr.task-verification-operation-result/v1`返回Task current报告、digest、内容/测试地图适用性、diagnostic和effects。

`buildr.task-retrospective-list-result/v1`同时返回matching/returned数量、`maxBytes`、实际`returnedBytes`与`truncated`。默认limit为100、字节预算为262144，公共最大值为1048576；item只在完整JSON对象边界加入。`--include-report`请求的正文无法完整容纳时省略正文并标记truncated，单Task `inspect`仍是全文入口。

`buildr.verification-evidence-cleanup/v1` 只报告 transient execution evidence 的 cleanup 状态。非 transient、identity 不匹配、目录越界或无法证明 provider ownership 的文件不会被删除。

`buildr.task-verification-operation-result/v1`统一覆盖current报告的`inspect|record`。成功时返回`operation`、`status`、`taskId`、`slot`、`effects`与`nextActions`；`slot`包含path、present、完整current报告、响应级digest和派生applicability。没有报告时返回空slot；调用方内容identity或Project测试地图变化时派生`stale`。业务拒绝返回同一envelope、`status: blocked`、稳定diagnostic和非零退出，且不得覆盖旧slot。

当保存Result含Project或Service coverage gap时，`nextActions`按Project返回只读`declaration-intake`提示；它不改变Result schema、gap事实或writer authority，也不在inspect/record中写`verification.yml`。

`buildr.task-record-result/v4` 覆盖六个 Task Record 动作，返回 closed v2 `record`、`recordDigest`、Parent/Child `taskRelations`与复盘来源/后续 `retrospectiveRelations`。`record.retrospectiveSourceTaskIds` 只保存 source Task ID；关系摘要补充当前标题和状态。完整 Application 列表仍使用 `buildr.task-record-list/v2`。

`buildr.parent-coordination-result/v3`覆盖Parent coordination actions，并直接替代v2。根对象返回operation/status/taskId、`parent-plan|child|ordinary|legacy` mode、紧凑`plan`摘要、Parent status/final acceptance、紧凑Planning Review、直接Children摘要与唯一顶层`contributions`。每个work item只在顶层Contribution Map出现一次，`expectedChild`规范化为`expectation.child`；Child只返回`boundContributions`与协调所需delivery摘要，不返回完整Contribution Handoff。`startup.next`是唯一下一步，依赖阻塞继续由`blockers`和各Contribution eligibility表达；完整`dependencyBlockers`只属于独立`buildr.parent-startup-readiness/v2`。它只组合Task Record与Development/Review/Finish Applications已保存事实；Child completed无matching handoff为`unproven`，最终验收不自动完成Parent。ordinary不产生Parent主体；legacy不backfill；Child返回紧凑`parentSource`。

Buildr Web stored-state projection 使用详情 v2 和列表 v4，在既有字段上增加 `retrospectiveRelations`并支持 `open|todo|active|completed|abandoned|all`过滤。`open` 只是查询语义，不持久。这两个视图仍不解析专业 currentness，`recordDigest`、`childTaskCount` 与关系摘要都不进入 Task Record schema。


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
