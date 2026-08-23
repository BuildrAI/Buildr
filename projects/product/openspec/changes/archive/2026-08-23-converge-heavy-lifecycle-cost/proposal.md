## Why

Buildr 日常核心 Full 已有可信的 52-step 范围，但测试执行仍反复创建 Workspace、Git repository、SQLite、CLI 子进程与 cleanup 世界；外层 step 并发和内层 `node:test` worker 又各自扩张，导致累计工作量、资源竞争和失败波动长期高于反馈预算。现在需要在不削弱真实 CLI、Git、Workspace、Finish 与 Release 主证据的前提下，建立与 runner 解耦的测试上下文和层级并发体系。

## What Changes

- 建立 test-only 的 Buildr Test Context：按稳定 context key 一次准备不可变 seed，以独立 sandbox lease 交付给 worker/test，并在释放时验证 seed identity、sandbox 隔离与 cleanup。
- 为 Workspace、Git、SQLite、Application/Runtime 和 Process/CLI 边界提供可组合 Context provider；继续使用 `node:test`，不把 Vitest 作为性能优化前置条件。
- 让 verification registry 声明 context profile、隔离策略、reset 策略、并行安全性与真实资源需求；外层 scheduler 向 executor 下发有界 inner worker grant，避免 outer × inner 过度订阅。
- 以 Task 生命周期为首个迁移域：同进程领域/应用行为使用轻量 Component context，真实 SQLite、CLI、Git 与 Workspace 边界保留 Integration，完整 Finish、自举、并发验收和初始化/cleanup 黄金路径保留 System。
- 为纯 52-step Core、focused owner 和 Full/affected 并发记录 context prepare、sandbox materialize、test body、resource wait 与 cleanup 证据，使用同 tree 多轮结果校准范围和预算。
- 新增完整验证框架文档，说明验证控制面、测试执行面、测试分层、Context 生命周期、并行/资源模型、证据 owner、Candidate/Release 边界和新增测试的接入方法。
- 本变更不包含外部产品 API 的破坏性变化，也不把 Product test-only runtime 发布进 npm package。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`：把既有不可变 System context 与资源调度要求扩展为 runner-independent Test Context、层级资源 grant、Task 领域分层迁移和可复核成本/隔离证据。

## Impact

- 主要影响 `services/buildr/test/context/`、`test/helpers/`、verification registry/scheduler/executor、Task/Workspace 测试 owner 与契约测试。
- 更新 Product 验证架构文档和 Buildr Service/current technical knowledge；新增术语时同步 glossary。
- 不新增生产依赖，不要求迁移到 Vitest，不改变唯一 Candidate tarball、Hosted Windows、Host Node、Launcher、npm integrity 或正式 Release readback 证据链。
