## Why

现有 Buildr Test Context 只复用了文件系统 seed，测试仍由各文件和 owner 自行创建 Runtime、Workspace、SQLite 与清理环境；它既不能像 Spring TestContext 一样按配置签名复用 Application Context，也不能指导后续 Node.js 项目统一注册测试。多轮局部 fixture 优化后 Core 仍需数分钟，说明继续堆叠测试专用 helper 已达到架构上限。

现在需要把 Context 从 Buildr 私有 fixture 提升为可复用的 Node.js 测试基础组件，让“注册测试、获取有界 Context、并发执行、自动 reset/失效”成为统一协议，再由 Buildr 作为首个真实消费者验证它。

## What Changes

- 新增 runner-independent 的 Node.js Test Context Runtime 公共模块，提供稳定 Context 定义、依赖图、配置签名、`worker`/`suite`/`test` scope、缓存、lease、reset、dirty/evict 与生命周期事件。
- 新增 `node:test` 适配器和 Context-aware runner：测试通过统一 API 声明所需 Context，runner 将相同配置的文件分配到持久 Worker Host，并让每个 Host 在多个测试之间复用 Application Context。
- 把不可变 seed、sandbox clone、事务/快照和完整重建建模为可插拔隔离策略；Runtime 不硬编码 Buildr Workspace、Git 或 SQLite。
- 在 `@buildr-ai/buildr` 包中提供稳定公共入口，未来 Node.js 项目可以直接导入该组件；不创建第二个发布事务或第二份 Candidate tarball。
- Buildr 提供首个 Application/Workspace Context provider，并迁移 Task Application 测试到注册式 API；真实 CLI、Git、跨进程 SQLite、Finish、自举和 Release 黄金旅程继续保留。
- 完整改写验证框架文档，说明公共 Runtime、Node runner、Buildr adapter、测试注册、Context 选择、并发、隔离、污染恢复、affected/Core/Candidate/Release 的关系。
- 不引入 Vitest/Jest；它们未来只能作为适配器，不改变 Context Runtime authority。

## Capabilities

### New Capabilities

- `node-test-context-runtime`: 定义可复用 Node.js Test Context Runtime、注册协议、持久 Worker Host、缓存身份、隔离/reset、失效与 runner adapter 行为。

### Modified Capabilities

- `product-verification-quality`: 要求 Buildr 验证执行面使用公共 Context Runtime 作为首个真实接入者，并以可复核证据证明缓存复用、并发边界和覆盖不退化。

## Impact

- 新增 `services/buildr/src/infrastructure/testing/context-runtime/` 公共实现和 npm 子路径入口。
- `services/buildr/test/context/` 收敛为 Buildr providers/compatibility adapter，不再拥有通用 Runtime authority。
- 影响 `node:test` 执行入口、Task Application 测试注册、verification registry/worker grant、测试与架构文档。
- 不新增生产依赖，不改变 Buildr CLI、Project Verification declaration、正式 Candidate/Release authority或唯一发布 artifact。
