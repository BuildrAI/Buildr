## Why

Buildr 当前仍把正式 Task、ready Task Environment 和自动 Finish 的内部路径当成修改、验证与交付的普遍准入条件，导致可从明确仓库、不可变研发交接和真实远端独立核验的合法工作被内部登记缺口阻塞。`gate-taxonomy` 已建立动作局部门禁分类，现在需要把 Task admission、Environment 与 Finish 的具体契约迁移到该分类，并保持真实身份、授权、证据与安全清理边界不变。

## What Changes

- **BREAKING**：Formal Task 不再自动要求所有编辑、构建与测试先取得 ready Task Environment；Environment 只约束 Buildr-managed checkout、Preparation、runtime projection、持久资源、正式环境证据和 cleanup。
- `buildr task next` 在 Environment 缺失时提供受管环境准备建议，但不再把它冒充整个正式 Task 的工作许可；只有当前动作真实消费 Environment authority 时才返回 required blocker。
- Task Development 允许 Agent 从明确、已授权且可独立观察的执行来源登记研发事实；Buildr-managed formal execution 仍必须绑定 matching Environment identity。
- 自动 Finish、直接 Git、PR 和独立 Delivery Reconciliation 统一消费 current immutable Development handoff，并从真实 remote 重建同形的逐 repository Delivery evidence。
- Delivery 成立后立即保持 Task completed；Activation、Environment Cleanup 与 Diagnostics 作为独立结果继续执行或形成 attention，不撤销 Delivery，也不阻塞其他 repository 已成立的交付。
- Environment cleanup 继续只接受可持久化并可独立复核的 Delivery evidence或明确 abandon；无法证明 ownership、containment 或 contribution equivalence 时仍零删除失败。
- 增加 alternate-path、局部失败隔离与多 repository 回归测试，并同步相关 Skills 和产品说明。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`：把 ready/Plan/Receipt 从正式 Task 的普遍准入门改为 Buildr-managed environment action 的局部 authority，同时保留资源、隔离和安全清理硬边界。
- `agent-task-workflows`：允许 Agent 在正式 Task 中选择直接工作、受管 Environment、自动 Finish 或外部交付对账，并只对实际消费动作装配相应 owner。
- `task-finish-execution`：让外部 Git/PR 交付对账从 current handoff、Task scope 与真实 repository/remote facts解析交付上下文，不把 ready Environment 或既有 Finish run 作为唯一来源。

## Impact

- 规范：`task-environments`、`agent-task-workflows`、`task-finish-execution`、`task-closeout-orchestration`。
- 实现：Task Entry Snapshot、Task Environment execution/read model、Task Development admission、Task Finish readiness/executor/reconciliation 与 Task Overview 投影。
- Agent 资产：`task-triage`、`task-development`、`task-environment`、`task-finish` 和产品入口 Buildr Skill。
- 测试：Task admission、Environment local readiness、自动/外部交付等价、多 repository 局部失败、Delivery 后 activation/cleanup/diagnostics attention。
- 不新增依赖，不改变 Release Candidate 与正式发布的不可逆门禁。
