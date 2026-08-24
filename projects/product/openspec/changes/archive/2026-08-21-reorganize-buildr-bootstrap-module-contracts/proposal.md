## Why

Task Record 已完成首个模块优先纵向切片，但 Buildr 仍由 `src/application/compose-runtime.mjs` 向宽 `runtime` 对象集中注册全部能力，公共 CLI Host 也仍位于全局 Interface 层并直接了解模块内部 Adapter。现在需要把参考切片推进为可复用的 Bootstrap 与模块公开合约，使后续 Web、System 和其他业务能力能够在不继续扩大全局耦合的前提下渐进迁移。

## What Changes

- 保持 `bin/buildr.mjs` 为稳定薄入口，将进程创建、内部快速入口、公共 CLI Registry、Help、诊断和分发收敛到 `src/bootstrap/cli/`。
- 将全局 Runtime 组装从 Application 层迁入 Bootstrap，建立显式模块描述、依赖解析、重复名称检查和可选 lifecycle 启停责任。
- 将 Task Record 模块改为显式接收窄依赖并提供 Application、CLI 与 HTTP contributions；Bootstrap 和公共 Host 不再直接导入 Task Record 内部 Application/Persistence/Adapter。
- 为尚未迁移的能力保留单一、明确 owner 和退出条件的兼容 Runtime Facade，禁止新增对宽 Runtime 的业务依赖。
- 原子更新直接生产消费者、测试、架构 verifier、Verification selector 和当前技术架构说明。
- 不改变公开 CLI、HTTP、JSON、错误映射、SQLite schema、事务、writer authority、普通 CLI 退出或 `buildr web` 同进程运行行为；不引入扫描式 DI。不存在破坏性公开变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-source-layout`: 增加 Bootstrap 所有权、显式模块 requires/provides/lifecycle 合约、模块 CLI/HTTP contribution 注册以及迁移期兼容 Facade 退出约束。

## Impact

- 主要影响 `services/buildr/bin/`、`services/buildr/src/bootstrap/`、现有 CLI Host、全局 Runtime 组装、`src/task/module.mjs`、Task Record CLI/HTTP Adapter 及其直接消费者。
- 更新受影响的 Unit、Contract、Integration、System、CLI architecture、npm tarball/Application Payload 和 Web 同进程验证。
- 更新 `services/buildr/docs/cli-architecture.md`、Project 技术架构 current knowledge 与相关 Verification ownership path；不改变测试能力的语义或选择模型。
