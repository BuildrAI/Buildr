## Why

Buildr 的 `fast` 入口仍整体执行包含真实 CLI、Git、文件系统和 Workspace 生命周期的 `integration-fast`，实际耗时约 60–96 秒，无法承担高频 Quick 反馈。Project Testing 已定义测试三轴和最低充分边界，现在需要把这套指导落实到 Buildr 自身的 registry 与编排中。

## What Changes

- 为每个 verification registry step 记录最小 Project Testing 分类事实，包括 owner、主要意图、执行边界、编排场景、证明范围和目标成本，并由 registry contract test 防止缺失或非法分类。
- 保留 `npm test` / `npm run test:fast` 兼容入口，但将其明确收敛为 Quick：完整运行低成本 Static、Unit、Component，只保留经实际成本证明适合高频运行的 Integration。
- 建立真实 `test:component` 入口，把适合的同进程有界组装测试从 Unit 中迁入 Component；不为目录形式迁移需要真实进程、Git、网络或 Workspace 生命周期的测试。
- 将重型 `integration-fast` 从 Quick 聚合中移出，但继续由 changed/focus 按 owner 选择，并完整保留在 Candidate 中。
- 更新 Buildr 测试实践文档与验证入口说明，记录本轮分类、基线、结果和仍待优化的问题。
- 不修改 `verification.yml` schema、Task Verification Result、Candidate 完整性、Release 门禁或业务验收边界；无破坏性公共产品变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cli-modular-architecture`: 统一 verification registry 需要保存可校验的测试分类和成本事实，Fast 兼容入口需要映射到真实低成本 Quick 编排，同时保持 affected、Candidate 和专项 selector 的完整边界。

## Impact

- `services/buildr/test/verification/registry.mjs`、planner contract 与入口测试。
- `services/buildr/package.json`、Fast wrapper、Unit/Component/Integration 测试编排。
- Product 验证文档和 Buildr 自举测试实践记录。
- 不增加依赖，不改变 Buildr CLI 的业务 API、Task Verification declaration schema 或 Result persistence。
