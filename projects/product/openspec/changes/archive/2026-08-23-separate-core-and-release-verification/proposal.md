## Why

当前 `candidate` profile 同时承担日常核心 Full、完整 Product Candidate 与正式 Release artifact 验证，导致普通执行语义变化为 tarball、Launcher、onboarding、Host Node 等发布级证据支付数分钟成本，也让 `product.full-regression`、Candidate CI 与发布工作流的 primary evidence 边界不清。可信选择与预算准入已经落地，现在需要把不同验证节点拆成稳定 lane，才能在不削弱发布证据链的前提下收敛日常反馈成本。

## What Changes

- 为本地日常核心 Full 建立独立 execution profile，只保留 Product/Buildr 的核心实现、契约和生命周期 primary evidence，并使用独立预算。
- 保持完整 Product Candidate profile、Candidate CI aggregate 与唯一 Candidate tarball，明确 tarball、Host Node、Launcher、Windows 和 Release smoke 由正式 Candidate/Release lane 持有。
- 重新定义 `product.full-regression` 为日常核心 Full；新增显式完整 Product Candidate capability，避免普通 Task、Parent 集成与正式发布混用同一入口。
- 让 affected、核心 Full、完整 Candidate 和 release group 各自输出稳定 scope reason、step 集合与证据责任，并补齐反例测试，保证同一目标内 primary evidence 不重复。
- 保持 `.github/workflows/verify.yml` 继续生成唯一 Candidate artifact 与 aggregate，`.github/workflows/publish.yml` 继续只消费匹配 Candidate generation 的同一 tarball；不修改正式发布事务、授权或 readback 语义。
- 本变更不包含破坏性公开 API 变更；验证 capability 的适用性和入口语义会被明确收窄。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 明确 affected、日常核心 Full、完整 Product Candidate 与正式 Release artifact lane 的 primary evidence、入口、预算和去重边界。

## Impact

- `projects/product/verification.yml` 的 Product verification capability 声明。
- Buildr verification registry、profile/planner、Candidate/changed/focus 入口及其契约测试。
- Candidate CI shard/aggregate 与 GitHub verify/publish workflow 的一致性契约。
- Product verification current knowledge、ownership 文档与 timing budget。
