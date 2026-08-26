## Why

Buildr 的正式验证仍把三个本可确定化的问题留给 Agent 反复恢复：同一变更路径因 Workspace/Project 相对根不同产生不同 Plan，完整 Preparation closure 直到首次 execution 才暴露，跨 Delivery、Activation、Cleanup、Diagnostics 的规划边界又容易漏审。现在需要把输入规范化和准备发现前移，同时保持 Core Rule 要求的宽而薄治理，不把语义判断收回状态机。

## What Changes

- `verification plan` 接受无歧义的 Project-relative 与 Workspace-relative changed path，并在进入 Request/Plan identity 前统一规范化为 Project-relative path。
- 正式 Task 的 Plan-only 调用可读取 matching Environment current，只读投影全部 selected capabilities 的 Preparation closure 与 closed Task Environment plan request；不启动 capability、不执行 Recipe、不写 Environment。
- Preparation preview 使用完整 selected closure，而不是只返回缺失集；Agent 先消费 preview 完成 Environment prepare，再启动正式 execution。
- Planning Review guidance 在计划确实跨多个 lifecycle owner 时，要求 Agent 说明受影响 owner、结果不变量与未覆盖边界；不创建权威地图、第二 Result 或通用硬门禁。
- 保留旧 verification declaration reader；Legacy v2 不获得 v3 的完整 Preparation preview 语义。
- 无破坏性变更；现有 Project-relative 输入、无 Task 的普通 plan-only 和 execution admission 继续兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `project-test-capabilities`: 统一 changed path 根语义，并让正式 Task Plan 提供只读 Preparation preview。
- `public-json-contracts`: 登记新的正式 Plan result envelope，并保持 raw Plan 与 installed CLI 契约兼容。
- `task-environment-preparation-plans`: 完整闭合 selected capabilities 的辅助准备请求，支持 Plan-before-execution 消费。
- `task-review-results`: Planning Review 对真实跨 owner 计划执行轻量语义边界审查。

## Impact

- Buildr npm package 的 Verification CLI/Application、Request/Plan domain、Preparation admission、公共 JSON registry 与 installed parity。
- Task Environment Plan Request/Plan compiler 的完整 closure 语义。
- 随包 `task-review` Skill guidance 及其 provider/consumer contract兼容验证。
- Product Verification provider、Browser capability 组合和相关 Unit/Integration/System/Contract 测试。
- 用户 Workspace 需在新版 Buildr 发布后执行正常 update/sync 才取得新 CLI 与受管 Skill；不会自动修改声明、Task、Environment 或依赖。
