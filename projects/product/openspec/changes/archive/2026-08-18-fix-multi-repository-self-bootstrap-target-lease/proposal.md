## Why

多仓 Task Finish 已把 target lease identity 升级为包含 retained repository root、remote 与 target branch 的 repository-scoped 摘要，但稳定 self-bootstrap 投影和 bundled runner 仍使用旧的 `remote:targetBranch` 逻辑值。结果是 Formal Finish 可以完成，而随后同一 run 的自举激活在任何副作用前被 SQLite authority 以 identity mismatch 拒绝，已完成的历史 run 也无法由旧 runner 收尾。

## What Changes

- 稳定 self-bootstrap 投影为 Workspace repository 暴露冻结的精确 `leaseTargetIdentity`，bundled runner 只使用该身份获取、刷新和释放 activation lease。
- retained target lease driver 对旧 runner 传入的 `remote:targetBranch` 提供有界兼容：仅当 matching Task/run 的冻结 repository set 中恰有一个适用 repository 命中该逻辑 target 时，解析到其精确 lease identity；零匹配、多匹配、跨 Workspace、跨 run 或错误 repository identity 均 fail closed。
- release 同样验证 Task/run owner、兼容解析结果、精确 lease identity 与 token fencing，避免旧逻辑值绕过 repository-scoped ownership。
- 增加连接 terminal Finish SQLite authority、稳定投影、bundled runner 与真实内部 driver 的回归测试，并覆盖唯一兼容恢复及拒绝矩阵。
- 不降低多仓 Task Finish 的 repository-scoped 隔离，不改变公共 CLI 参数或 Result major；稳定 self-bootstrap `v1` 只增加向后兼容字段。本变更不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 稳定 self-bootstrap detail 必须投影 Workspace repository 的精确 lease identity，内部 target lease driver 必须按 repository-scoped owner 校验并只为唯一历史逻辑 target 提供受控兼容解析。
- `task-closeout-orchestration`: bundled self-bootstrap runner 必须复用投影中的精确 repository lease identity，并定义旧 runner 对已存在 run 的唯一匹配恢复与 fail-closed 边界。

## Impact

- 影响 Task Finish self-bootstrap Result projector、SQLite target lease repository、内部 target lease driver 与 bundled self-bootstrap closeout runner。
- 影响 self-bootstrap projection、SQLite persistence、runner integration 和真实 driver/terminal row 回归测试。
- 不改变 Task Environment repository discovery、Formal Finish 五阶段、Delivery Carrier、公共 CLI surface、Task 状态或自举唯一 runner ownership。
