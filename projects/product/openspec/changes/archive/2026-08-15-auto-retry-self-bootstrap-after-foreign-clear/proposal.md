## Why

当前 self-bootstrap runner 在发现 foreign Finish carrier 时会正确地零副作用停止，但即使该 carrier 随后已由原 owner 清除、当前 closeout 仍属于用户已授权的同一 run，Agent 也必须再次向用户取得授权才能重试。这把安全的外部等待变成了不必要的人机往返，也没有增加新的身份或副作用保护。

## What Changes

- 保留 foreign carrier 存在期间的 fail-closed、零副作用停止，以及所有跨 owner cleanup/mutation 的显式授权。
- 当用户已经授权当前 self-bootstrap closeout、前次仅因 foreign carrier 且 `effects: []` 停止、foreign carrier 已由其原 owner 清除时，允许 Agent 自动重新调用同一 runner，不再为 current retry 单独询问用户。
- 自动重试必须重新读取远端 `dev`；retained `dev` clean 且只需 fast-forward 时可更新到最新远端，再从头执行完整 preflight。只有最新 HEAD 是 frozen Finish ref 的可证明 Buildr-owned descendant 时才继续。
- 最新 `dev` 无法 fast-forward、出现未知提交/merge/remote drift、run 或 plan identity 变化，或再次出现 foreign carrier 时，停止并报告问题，等待新指令。
- 不增加持久队列、后台协调器、跨 run writer、跨 owner mutation authority 或新的 Product Application/store。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-closeout-orchestration`: 收紧 multi-run self-bootstrap recovery plan 的授权与自动重试语义。
- `agent-task-workflows`: 允许 Agent 在既有用户授权和严格零副作用/currentness 条件下自动重试同一 self-bootstrap closeout。

## Impact

- Workspace 源 Skill：`skills/buildr-self-bootstrap-sync/`。
- Task Finish 的 self-bootstrap contribution 与 `buildr-self-bootstrap` Component integrity。
- self-bootstrap runner 的 recovery plan JSON、Agent 指引与集成测试。
- Product canonical OpenSpec 与 current knowledge；不改变普通用户 Workspace、npm package、Task Finish Result 或 SQLite schema。
