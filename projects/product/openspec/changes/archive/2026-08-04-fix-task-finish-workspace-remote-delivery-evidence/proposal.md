## Why

Task Finish 在 Project 使用 `source.type: workspace` 时可能从 Environment Receipt 得到空 `remote`，随后只推进本地 `dev`，却把 carrier ref 写成 `remoteAfterRef` 并报告完成。这会把“本地已集成”误报为“远端已交付”，必须先于下一轮自动收尾修复。

## What Changes

- 当 retained Workspace 是 Git repository 时，Finish 必须从真实 retained checkout 解析可用 target remote；无法唯一、安全解析时在 delivery mutation 前停止。
- 普通 push 成功后必须重新读取远端 target ref，并且只有回读值等于 carrier ref 时才能记录远端交付完成。
- 没有远端交付要求的显式场景只能记录本地 transition，不得伪造 `remoteAfterRef`。
- 增加 workspace-source 正常路径、远端缺失和 push 后回读不一致的回归测试；不扩展五阶段执行器、Candidate 或 Verification authority。

本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `task-finish-execution`: 明确 workspace-source retained checkout 的远端解析、普通 push 后远端回读与 delivery evidence 成立条件。

## Impact

- `task-finish-application` 的 run identity 解析。
- `task-finish-product-executor` 的 deliver 门禁和远端证据。
- Task Finish contract/Skill、CLI 文档及相关 Integration/System tests。
- 不引入新 schema、第二 writer、远端任务分支或新的恢复协议。
