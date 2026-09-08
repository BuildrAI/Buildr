## ADDED Requirements

### Requirement: OpenSpec 必须消费窄且具名的资产支撑能力
OpenSpec MUST 只取得自身实际需要的资产读取与校验方法，并通过明确类型和方法可用性检查组装；MUST NOT 将完整 `AGENT_ASSETS_INTERNAL` 注入 OpenSpec。该收窄 MUST 保持既有 OpenSpec 内容查询、严格验证、收敛、归档和错误行为。

#### Scenario: 组装 OpenSpec
- **WHEN** 创建 OpenSpec 模块
- **THEN** 资产依赖 MUST 只提供 `assertName`、`componentDefinitionFile`、`readComponentDefinition`、`readComponentsManifestForWrite` 和 `runCommandsCheck`
- **AND** 缺少所需方法 MUST 在装配时明确失败，不延迟为执行中未知方法错误

### Requirement: 适配声明与运行时文件执行必须具有独立所有者
Agent Assets MUST 区分适配声明、选择、声明性计划与运行时（Runtime）文件执行；执行器 MUST 单向消费适配声明，不形成循环依赖。文件路径校验、内容比较、写入、删除和既有恢复逻辑 MUST 归属同一明确执行者，不在声明文件保留重复实现或转发。

#### Scenario: 只比较投射计划
- **WHEN** 使用 `compareOnly` 比较当前文件与计划
- **THEN** 执行器 MUST 保持既有发现项与冲突信息
- **AND** MUST 不写入、删除或修改文件权限

#### Scenario: 执行投射计划
- **WHEN** 使用迁移后的执行器应用计划
- **THEN** MUST 保持冲突写前拒绝、路径与符号链接检查、二进制内容和执行位，以及 `commitLast`、`removeLast` 的既有顺序
- **AND** MUST 保持既有幂等结果、异常与恢复触发范围，不把局部恢复扩大为新的事务承诺

#### Scenario: 旧回执迁移失败
- **WHEN** 已触发现有旧回执迁移恢复机制，且执行中发生失败
- **THEN** 执行器 MUST 恢复原文件和旧回执，并保留原错误与资源清理语义
