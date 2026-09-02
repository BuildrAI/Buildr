# task-delivery-finish-module-architecture Specification

## Purpose

定义 Task Delivery 与 Finish 集群在 `task` 模块中的技术分层、唯一组装、交付副作用边界、旧入口退出和行为等价要求。

## Requirements

### Requirement: Task Delivery 与 Finish 必须归属 Task 模块的明确技术分层
Task 模块 MUST继续唯一装配历史收尾读取、完成结果与必要资源维护。旧run、rollover、reconcile写入口和其专用执行逻辑 MUST退役；各动作仍由原任务记录、环境、Git和业务能力承担，MUST不建立新的统一收尾应用。

#### Scenario: 检查生产源码归属
- **WHEN** CLI、界面或内部工具读取历史或处理已登记资源
- **THEN** MUST使用同一所属模块的事实；保持历史可读、身份及删除安全，不恢复旧执行链或伪造完成。

### Requirement: Task 模块入口必须唯一装配 Finish 与 Terminal Delivery
Task 模块 MUST继续唯一装配历史收尾读取、完成结果与必要资源维护。旧run、rollover、reconcile写入口和其专用执行逻辑 MUST退役；各动作仍由原任务记录、环境、Git和业务能力承担，MUST不建立新的统一收尾应用。

#### Scenario: 创建完整 Bootstrap runtime
- **WHEN** CLI、界面或内部工具读取历史或处理已登记资源
- **THEN** MUST使用同一所属模块的事实；保持历史可读、身份及删除安全，不恢复旧执行链或伪造完成。

#### Scenario: 创建轻量 Finish inspect runtime
- **WHEN** CLI、界面或内部工具读取历史或处理已登记资源
- **THEN** MUST使用同一所属模块的事实；保持历史可读、身份及删除安全，不恢复旧执行链或伪造完成。

### Requirement: Finish CLI 与 retained recovery 必须通过 Task 模块入口接入
Task 模块 MUST继续唯一装配历史收尾读取、完成结果与必要资源维护。旧run、rollover、reconcile写入口和其专用执行逻辑 MUST退役；各动作仍由原任务记录、环境、Git和业务能力承担，MUST不建立新的统一收尾应用。

#### Scenario: 构建 CLI command registry
- **WHEN** CLI、界面或内部工具读取历史或处理已登记资源
- **THEN** MUST使用同一所属模块的事实；保持历史可读、身份及删除安全，不恢复旧执行链或伪造完成。

#### Scenario: 执行 retained recovery
- **WHEN** CLI、界面或内部工具读取历史或处理已登记资源
- **THEN** MUST使用同一所属模块的事实；保持历史可读、身份及删除安全，不恢复旧执行链或伪造完成。

### Requirement: 交付副作用与专业 authority 必须保持隔离
Task 模块 MUST继续唯一装配历史收尾读取、完成结果与必要资源维护。旧run、rollover、reconcile写入口和其专用执行逻辑 MUST退役；各动作仍由原任务记录、环境、Git和业务能力承担，MUST不建立新的统一收尾应用。

#### Scenario: 启动正式 Finish
- **WHEN** CLI、界面或内部工具读取历史或处理已登记资源
- **THEN** MUST使用同一所属模块的事实；保持历史可读、身份及删除安全，不恢复旧执行链或伪造完成。

#### Scenario: 交付后维护部分失败
- **WHEN** CLI、界面或内部工具读取历史或处理已登记资源
- **THEN** MUST使用同一所属模块的事实；保持历史可读、身份及删除安全，不恢复旧执行链或伪造完成。

### Requirement: Terminal Delivery 模块必须隔离旧 Finish 历史
Task模块 MUST以只读history adapter公开旧Finish run和terminal facts，并 MUST让Terminal Delivery只依赖Task Record与该history adapter。当前Task Finish Skill、Task Review、Task Development与历史adapter MUST保持独立。

#### Scenario: Bootstrap装配Terminal Delivery
- **WHEN** Bootstrap创建完整runtime
- **THEN** Terminal Delivery module requires MUST不包含Task Development或Task Review Application
- **AND** history adapter失败 MUST只影响历史交付section

#### Scenario: 当前收尾
- **WHEN** 用户通过`task-finish` Skill完成新的交付与善后
- **THEN** Skill MUST组合Task Record、Environment、Git和业务工具
- **AND** MUST不创建旧Finish run或要求Terminal Delivery association
