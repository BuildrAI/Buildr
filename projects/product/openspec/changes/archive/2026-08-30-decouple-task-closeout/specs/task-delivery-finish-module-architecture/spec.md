

## REMOVED Requirements

### Requirement: 迁移必须保持外部、存储、运行与发布行为等价
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

## MODIFIED Requirements

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
