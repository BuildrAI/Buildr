## Why

首次真实自举验收证明：新候选若直接拒绝自身 checkout 的 `sync`，旧 retained Task Environment controller 仍会调用该命令，导致修复自身无法完成 Environment 与 Verification。安全边界必须兼容上一版 retained controller，同时继续保证零 source/store mutation。

## What Changes

- linked candidate 对自身 checkout 调用完整 `sync` 时，不再失败，而是在任何 source/store mutation 前自动收敛为包含产品 Skill 的 projection-only render。
- 命令明确提示实际执行的是兼容投射，并给出新调用方式与独立 Workspace 完整 sync 指引。
- 新版 Task Environment 仍显式调用 `render --product-skill`；自动降级只承担跨版本自举兼容。
- 保持 retained canonical sync、candidate-to-isolated-workspace full sync 与越界 target fail-closed 行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-first-runtime-projection`: linked candidate/self-checkout 的 `sync` 从失败式门禁调整为零 source/store mutation 的兼容投射。

## Impact

- 影响 Buildr runtime sync 应用层、诊断与回归测试。
- 不改变 Task Environment 新编排、Task 生命周期、Cleanup、Git 远端或普通 canonical Workspace sync。
- 这是向后兼容修正，不是破坏性变更。
