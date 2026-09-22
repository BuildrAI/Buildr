# Node.js 测试上下文：复用、隔离与生命周期

本篇解释 Buildr 提供的 Node.js 测试上下文运行时（Test Context Runtime）：如何复用昂贵准备，同时保持案例隔离和清理可靠。Node.js 项目可按需使用，其他技术栈无需采用；下文以 [Buildr 产品测试架构](../architecture/verification-framework.md)说明具体接入。公共实现位于 `services/buildr/src/infrastructure/testing/context-runtime/`；Buildr 专用提供者（Provider）位于 `services/buildr/test/context/`。规范依据是[运行时契约](../../../openspec/specs/node-test-context-runtime/spec.md)。

## 解决什么问题

昂贵的应用组装可以在同一工作进程（Worker Host）中复用；每个案例仍取得属于自己的使用权与隔离状态。复用只消除与本次断言无关的准备成本，不能把被验证的初始化、迁移、安装或清理本身跳过。

运行时（Runtime）只管理定义、身份、缓存和生命周期。项目工具决定选择哪些测试、授予多少资源；提供者（Provider）决定状态怎样隔离和恢复；`node:test` 仍负责断言、测试语义和报告。

## 定义与身份

公开入口是 `@buildr-ai/buildr/test-context`，随 Buildr 同一个 npm 包交付。源码为 TypeScript，`test-context:generate` 生成包内标准 ESM 和类型声明；`test-context:check` 检查生成物。包导出使用生成的 JavaScript，不要求消费者执行原始 `.ts`。

`defineTestContext()` 描述可缓存状态，主要字段如下：

| 字段 | 含义 |
| --- | --- |
| `id`、`version` | 稳定标识与生命周期兼容版本 |
| `scope` | `worker`、`suite` 或 `test` 的生存范围 |
| `parallelSafety` | `shared`、`exclusive` 或 `isolated` 的并发保证 |
| `create` | 创建可缓存状态，必需 |
| `dependencies`、`sourceIdentity` | 显式依赖与来源身份 |
| `acquire/release/reset/inspect/destroy` | 取得案例值、归还、恢复、检查污染和销毁的可选钩子（Hook） |

缓存身份（Cache Identity）组合定义标识与版本、规范化 JSON 配置、来源身份、依赖身份和所属范围身份。配置只接受可确定的 JSON 值；不接受函数、循环对象或隐式类实例。任何有关身份改变都必须重新创建，不能为了命中缓存固定错误身份。

## 生存范围与并发

| 范围 | 生命周期 | 典型用途 |
| --- | --- | --- |
| `worker` | 同一持久工作进程（Worker Host） | 应用组装、只读准备池 |
| `suite` | 显式测试集合（Suite）至 `closeSuite()` | 有界共享状态 |
| `test` | 单个测试使用期 | 独立事务、会话或临时资源 |

长期对象不能依赖短期对象：`worker` 只依赖 `worker`，`suite` 可依赖 `worker/suite`。依赖先创建，关闭时按创建逆序销毁。

`shared` 只适用于提供者（Provider）明确保证安全的共享状态；`exclusive` 串行取得同一状态；`isolated` 通过独立取得的案例值隔离并发。数据库回滚不能恢复其他连接、文件、Git 或子进程副作用；这些边界需要各自的隔离方式。

典型生命周期是解析定义及身份 → 创建或命中缓存 → 等待并发许可 → `acquire` → 测试体 → `release/inspect` → 空闲时 `reset` 或失效 → 继续复用或失效，最后销毁。显式脏标记（Dirty）`markDirty()` 会使对象在归还后失效；未预期污染以及恢复、检查、销毁失败必须可见，不能静默重建后记为通过。

## 测试如何接入

`contextTest()` 的回调取得 Node.js 测试上下文（TestContext）、按别名解析的值，以及包含身份和 `markDirty()` 的控制对象。显式使用时也可通过 `createTestContextRuntime()` 与 `createNodeTestContextAdapter()` 组装。具体签名以[公共导出](../../../services/buildr/src/infrastructure/testing/context-runtime/public.ts)及[类型定义](../../../services/buildr/src/infrastructure/testing/context-runtime/types.ts)为准。

直接运行单文件时，适配器（Adapter）建立进程本地运行时（Runtime），并在结束时关闭，不依赖 Buildr 的项目调度器（Scheduler）。需要跨文件复用时，项目步骤采用 `node-context-test`：`runNodeTestContextHosts()` 把文件分给不超过外层额度的持久工作进程（Worker Host），各进程内使用 `node --test --test-isolation=none --test-concurrency=1`。

对象不跨进程共享。多个工作进程（Worker Host）各自持有缓存；只有已接入的测试进入这种模式，其他测试保留自己的进程隔离。任一工作进程（Worker Host）失败会使汇总失败。

## Buildr 专用隔离

Buildr 将公共运行时（Runtime）用于应用与工作空间（Workspace）测试，并保留外层不可变文件系统准备池。相关提供者（Provider）包括 `task-application.ts`、`task-lifecycle.ts` 与 `prepared-fixtures.ts`。

- 应用组装可复用，但覆盖共享端口时使用排他访问；每个案例仍在独立沙箱（Sandbox）中修改数据。
- 初始化后的工作空间（Workspace）、项目基础和 Git 远端准备可作为不可变来源，每次取得独立副本。
- 初始化、迁移、恢复、工作树（Worktree）创建清理、安装和启动器（Launcher）生命周期本身是待证事实时，保留真实执行。
- 候选压缩包已有项目执行计划（Verification Plan）中的唯一生产者，不能再建立另一份上下文缓存冒充同一发布物。

`test/context/dispositions.ts` 对每个步骤声明是否采用复用及原因；`test/context/runtime.ts` 负责外层文件系统准备池，不成为第二套公共运行时（Runtime）。

## 如何判断优化有效

比较同一目标、同一范围下的真实总耗时，并分解创建、命中、取得、等待、测试体、恢复、污染失效、销毁和清理。缓存命中增加不保证总耗时降低；必须同时保留实际隔离和反例。

当前没有跨进程共享应用对象，也没有通用 Git 写时复制（Copy-on-Write）或 Vitest 适配器（Adapter）。后续扩展依据真实消费者和瓶颈决定；这些技术限制不会让通用任务验证（Task Verification）接管项目执行。
