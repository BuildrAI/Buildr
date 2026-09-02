## ADDED Requirements

### Requirement: Buildr Web Task 页面必须退出研发与旧交付历史
Buildr Web MUST以Task Record为任务目标和结果authority，按需读取Review、Verification、Environment、Retrospective和Parent facts。页面 MUST不请求或展示Development、Task Candidate、Handoff、Task Planning Identity、Terminal Delivery或旧Finish history。

#### Scenario: 查看没有Development的Task
- **WHEN** 用户打开任意active、completed或abandoned Task
- **THEN** 页面 MUST正常展示Task、Change、证据、复盘和环境
- **AND** MUST不存在研发页签、研发空状态或旧机器交付历史section

#### Scenario: 完成任务
- **WHEN** 用户通过现有Task Record动作完成Task
- **THEN** 页面 MUST展示Task Record保存的结果
- **AND** MUST不要求或查询Development/Finish历史证明

## REMOVED Requirements

### Requirement: Buildr Web 必须展示保存的终态交付事实
**Reason**: 用户授权删除旧Finish机器交付历史。
**Migration**: 只展示Task Record结果与当前Environment清理事实。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Buildr Web 必须通过 Task Finish Application 投影 current 与 terminal 状态
**Reason**: Task Finish Application与`task_finish_current`删除。
**Migration**: 删除对应HTTP、DTO、read worker和UI。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Buildr Web Task 页面必须分别读取独立专业事实
**Reason**: 该Requirement仍把已删除的Development与Finish history列为页面数据源。
**Migration**: 页面只读取保留的Task、Review、Verification、Environment、Retrospective和Parent事实。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入
