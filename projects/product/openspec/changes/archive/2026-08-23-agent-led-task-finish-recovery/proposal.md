## Why

当前 Task Finish 的恢复语义仍把部分事故形态固化为产品内的唯一动作判断，导致未知交付情况容易被误判为“继续旧 run”或需要新增专用兼容分支。现在需要把责任边界收敛为：Buildr 提供可信事实、确定性安全不变量、安全原语与结果对账，Agent 根据这些事实选择 Git、PR、重新开发、恢复或放弃策略。

## What Changes

- **BREAKING**：`task next` 不再把 Finish 恢复投影为唯一正确动作；它只暴露当前阻碍、事实适用性和可用能力，并区分 required 安全前置与 recommended 推进建议。
- 提供统一的 Finish current facts 只读模型，使自动 `run`、Agent 直接 Git/PR 与 `reconcile` 消费同一组 Task、Handoff、repository、carrier、remote containment 和 side-effect 事实。
- 把 ownership、identity、side-effect containment、remote containment 等确定性安全不变量与策略判断分离；不变量失败继续 fail closed，策略未知时返回事实和能力而不替 Agent 决策。
- 提供少量 Product-owned 安全原语，覆盖精确 carrier 清理与符合严格资格的旧 run 退休；不为历史事故扩展开放式迁移状态机。
- 用代表性正反旅程证明未知交付可由 Agent 处理，同时保留 force push、越权清理、身份歧义和完成误报的阻断边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`：重新定义 Finish 恢复事实、共享安全不变量、安全原语、Agent 策略边界、结果对账和 `task next` 投影行为。

## Impact

- 规范：`openspec/specs/task-finish-execution/spec.md`。
- 实现：Buildr Service 的 Task Finish Application、CLI/HTTP read model、Task Entry Snapshot 与相关 persistence/cleanup 边界。
- 测试：Task Finish contract/integration/system journeys，以及 `task next` 的契约测试。
- 当前认知：`openspec/knowledge/architecture/technical.md` 与 `openspec/knowledge/services/buildr.md`。
- 不新增外部依赖，不改变 Task Development、Task Verification、Task Review 或 Git Operations 的 writer authority。
