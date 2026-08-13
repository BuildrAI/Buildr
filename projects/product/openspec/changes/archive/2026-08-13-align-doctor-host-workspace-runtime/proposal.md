## Why

`adopt-npm-only-distribution` 已将当前产品收敛为 npm Host Node 与 Workspace Node 两个 runtime role，但 canonical Doctor spec 中一条既有 Requirement 仍正向要求 platform Product Node。该遗漏会让规范与已验证实现、当前知识及产品决策冲突，必须在形成 Development Handoff 前消除。

## What Changes

- 将 Doctor 的只读 Node toolchain 契约收敛为 npm Host Node、development runtime 与 Workspace Node。
- 明确当前不得报告 platform Product Node role，并保留 Workspace Node 缺失/漂移的只读诊断边界。

## Capabilities

### Modified Capabilities

- `agent-readable-doctor`: 删除当前 Product Node/platform runtime 正向要求，保持 Host Node 与 Workspace Node 分离诊断。

## Impact

- 仅修订 canonical Doctor contract；实现、测试和 current knowledge 已由 npm-only Change 对齐。
- 不引入发布、Finish、tag、npm publish、GitHub mutation 或 push。
