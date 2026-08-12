## Why

Buildr 当前 registry 只用测试分类与目标耗时约束 Quick；真实 filesystem、CLI 子进程、Git、临时 Workspace 和重复清理仍可能因 step 名称或暂时较快而进入 Component 或 Quick。当前 `contract` step 已包含这类真实环境测试，因此需要在未来新增 step 前建立可自动判定的准入事实与拒绝门禁。

## What Changes

- 为每个 verification registry step 补充最小环境足迹与重置负担事实，并由 planner/static contract 校验完整性。
- 明确 Component 不得穿过真实 filesystem、CLI、Git、网络或完整 Workspace 生命周期。
- 明确重复初始化、迁移、安装、环境清理或完整生命周期不得进入 Quick；低成本 Integration 只有在明确、可测、隔离且无上述重置负担时才可例外进入。
- 拆分当前 `contract`：静态契约保留在 Quick，真实开发入口、Git、临时 Workspace 与环境生命周期测试迁入 Integration/affected，同时保持 Candidate 与 focus 可选择。
- 保持 `verification.yml` schema、Task Verification authority 和现有通用执行框架不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 增加基于环境足迹与重置负担的 Component/Quick 准入契约和自动拒绝行为。

## Impact

- 受影响实现：`test/verification/registry.mjs`、`test/verification/planner.mjs`、相关 contract/integration 测试与 npm 直接入口。
- 受影响行为：Quick step membership、contract 与 Integration 的测试文件归属、changed/focus/Candidate 选择。
- 无 `verification.yml` schema、Task Verification、通用调度器或测试平台变化。
