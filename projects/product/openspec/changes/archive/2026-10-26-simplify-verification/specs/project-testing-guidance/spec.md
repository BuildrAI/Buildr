## REMOVED Requirements

### Requirement: Buildr 必须提供无状态 Project Testing 指导
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

### Requirement: Project Testing 必须使用正交测试边界
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

### Requirement: Project Testing 必须按待证明事实确定 owner
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

### Requirement: Project Testing 必须优先最低充分执行边界
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

### Requirement: 第一版验收测试必须保持占位边界
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

### Requirement: Project Testing 必须建立最小测试质量闭环
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

### Requirement: 新增测试必须提供可信有效性证据
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

### Requirement: 替身与有状态测试必须保持事实真实性
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

### Requirement: 共享 helper 改动必须优先运行最低成本兼容 canary
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

### Requirement: Project Testing 必须建立可发现的稳定测试能力
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

### Requirement: Project Testing 必须区分验证目标、选择范围和证据边界
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

### Requirement: 缺失测试能力必须交回建设与声明流程
**Reason**: 统一为四类检查、两个技能（Skill）及明确命令，撤销旧档位和重复交接。
**Migration**: 使用统一产品验证及测试建设职责，保留真实行为与既有授权边界。

## ADDED Requirements

### Requirement: 测试建设必须围绕公共结果和真实反例
project-testing SHALL 依据项目实际代码、工具、配置和约定说明待证明事实、公共可观察结果、关键案例及有效断言。替身 SHALL 只隔离外部协作者，不复制被测决策；缺陷回归 SHALL 在安全可行时证明能捕获旧错误，无法取得真实反例时 SHALL 说明替代证据和缺口。

#### Scenario: 内部完整功能
- **WHEN** 一个内部功能可以通过替身仓储或客户端隔离外部依赖
- **THEN** SHALL 在单元测试（Unit Test）中保留真实业务判断验证完整内部流程，不限定一个函数或一个类

### Requirement: 测试建设必须使用四类并保持低成本意图
project-testing SHALL 按真实行为使用 Static、Unit、Integration、E2E。单元测试（Unit Test）SHALL 减少准备、真实等待和资源消耗，真实技术连接 SHALL 归集成测试（Integration Test），实际入口完整流程 SHALL 归端到端测试（End-to-End Test，E2E）。慢但仍为内部逻辑的检查 SHALL 先审视实现和准备设计，不得仅因慢移类；不设置固定耗时准入。

#### Scenario: 边界混合
- **WHEN** 单个文件同时包含纯判断和真实 Git、数据库或进程检查
- **THEN** SHALL 保留有效断言并按必要范围拆分或归类，不得因目录名称宣称低成本

### Requirement: 建设必须同时维护稳定登记与选择覆盖
project-testing SHALL 同时维护真实测试、执行入口、相关选择映射及项目测试地图。地图 SHALL 只登记稳定能力和准确路径根，不复制每个文件；同一事实 SHALL 有唯一主要证明，现行消费者 SHALL 使用实际命令。project-verification SHALL 读取登记选择和执行，并将缺口直接交还建设者。

#### Scenario: 新增或调整公共入口
- **WHEN** 新行为影响公共入口、数据、副作用、构建、安装后或平台机制
- **THEN** SHALL 追踪受影响调用面，补齐最低充分测试与选择映射，维护已授权范围内的稳定能力声明

### Requirement: 建设与执行必须保持独立证据职责
project-testing SHALL 不保存第二份测试运行状态或任务验证报告；project-verification SHALL 根据当前内容、环境和用户请求判断证据，保存已有合法任务的真实报告或直接交付独立结果。准备和测试的隔离、清理、幂等及必要恢复 SHALL 由实际资源所有者负责。

#### Scenario: 用户指定验证
- **WHEN** 用户只要求具体类型或检查而没有正式任务
- **THEN** SHALL 可直接执行并报告真实证据，不要求创建任务或登记能力占位
