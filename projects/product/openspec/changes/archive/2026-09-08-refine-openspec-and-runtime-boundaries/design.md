## Context

OpenSpec 的五个实际资产依赖是 `assertName`、`componentDefinitionFile`、`readComponentDefinition`、`readComponentsManifestForWrite` 和 `runCommandsCheck`。当前 `AGENT_ASSETS_INTERNAL` 额外包含同步、写入支撑和无关诊断方法；结构断言掩盖了所需边界。

运行时（Runtime）的 `adapter-contract.ts` 同时拥有描述与注册、声明性计划、路径安全、文件比较、写删及恢复。适配描述中的 `planRuntime` 会构造计划，直接让声明层导入执行器会形成循环依赖。

## Goals / Non-Goals

目标是收窄 OpenSpec 的跨模块依赖，并让适配声明与文件执行可以独立定位、验证和维护。不修改公开命令、适配器（Adapter）集合、页面、权限、文件内容、排序、恢复条件或现有错误语义；不趁机重写文件执行算法。

## Decisions

1. 资产模块公开 `AGENT_ASSETS_OPENSPEC_SUPPORT` 与具名类型，只包含五项实际方法。OpenSpec 的装配改为消费该能力，并校验方法存在；Workspace 仍按现有需求消费自身资产接口，不扩大本次范围。
2. `adapter-contract.ts` 保留适配描述、注册、选择和 `createRuntimeContext`、`createRuntimePlan` 等声明性构造；新 `runtime-reconciler.ts` 拥有 `assertRuntimeTargetPath`、`validateRuntimePlan`、`reconcileRuntimePlan` 及其文件辅助逻辑。执行器读取适配声明，声明不反向导入执行器。
3. 比较、预检、写删顺序与恢复整体迁移，不按每个函数新建文件。底层字节与权限工具继续复用 `skills/projection-files.ts`，不重复实现。
4. 所有生产、测试和工程消费者改到真实所有者；内部路径不新增长期兼容转发。现有命令、包出口与发布依赖闭包保持完整。

## Risks / Trade-offs

- 循环依赖风险 → 声明性计划构造留在适配文件，执行器单向消费声明；由依赖图检查验证。
- 方法遗漏或签名漂移 → 具名类型、提供者与消费装配检查、缺失方法反例及 OpenSpec 集成测试。
- 文件副作用漂移 → 迁移原算法，覆盖 `compareOnly` 零写入、冲突前置拒绝、二进制与执行位、`commitLast`/`removeLast`、旧回执迁移失败恢复及重复运行。
- 只移动生产文件遗漏打包或验证器 → 检索全部直接消费者，并更新文件写入白名单、架构断言与代码地图。

## Migration Plan

先迁移具名依赖，再分离执行器并更新全部消费者；运行低成本检查、相关文件执行测试及完整本地集成测试。无数据迁移。未验证的候选不更新保留工作空间；失败保持现场并修正对应范围。

## Open Questions

无。
