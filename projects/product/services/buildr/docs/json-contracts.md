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
| `openspec baseline create` | `buildr.openspec-baseline/v1` |
| `openspec check` | `buildr.openspec-check/v1` |
| `openspec converge` | `buildr.openspec-convergence/v1` |
| `openspec audit` | `buildr.openspec-convergence-audit/v1` |
| `worktree create` | `buildr.worktree-create/v2` |
| `worktree inspect/context` | `buildr.task-environment-context/v1` |
| `worktree adopt` | `buildr.task-environment-adoption/v1` |
| `verification run` | `buildr.verification-run/v1` |

`buildr.worktree-create/v2` 的 `state` 为 `created`、`reused` 或 `blocked`，`environment` 披露 environment root/owner/isolation，`repositories` 返回完整 plan 的逐仓 checkout/branch/HEAD/clean/state。`treeChanged` 表示本次调用是否创建任一 checkout；`bootstrap` 保留根 Workspace 的 doctor/sync 决策；`runtimeExpectation`、`adoption`、`cliInvocation` 与 `executionBinding` 是向后兼容新增字段。`cliInvocation.command` 是绝对可执行入口，`argsPrefix` 是消费者必须置于子命令之前的固定参数；自举环境使用 checkout-local bridge，外部产品不依赖目标 Workspace 的布局。`buildr.task-environment-adoption/v1` 返回 Buildr-verified environment/runtime evidence 与 agent-attested session evidence。`buildr.task-environment-context/v1` 返回当前 membership、`allowedExecutionRoots`、CLI source/invocation、全仓 identity、adoption 和 `executionReady`；environment 或 execution binding 不 ready 时非零退出并保留现场。

`buildr.verification-run/v1` 返回 operation/status、required assurance、Project policy fingerprint、可选 task environment binding、repository candidate identity、计划选择与 supersedes、逐项命令终态、资源等待/lease/释放、真实整体 wall-clock、Candidate completeness、`evidenceIdentity`、reference 和 lifecycle。required check 或请求校验失败仍输出同一单一 JSON envelope 并非零退出；worker stdout/stderr 只作为有界字段进入 checks，不与顶层 JSON 混排。

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
