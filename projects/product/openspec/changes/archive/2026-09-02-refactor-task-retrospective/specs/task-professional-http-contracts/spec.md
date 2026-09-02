## MODIFIED Requirements

### Requirement: 专业 Task HTTP operation 必须拥有稳定机器契约
Task专业HTTP catalog MUST只覆盖实际存在的Overview、Review、Verification与Coordination操作。独立Retrospective读写、处置和批量operation MUST退出catalog；固定本机复盘文档读取 MUST归Task Record HTTP catalog。

#### Scenario: 前端读取Review
- **WHEN** Buildr Web请求Task Review或Verification detail
- **THEN** HTTP MUST返回所属Application read model
- **AND** MUST不调用Retrospective、Development或prompt generator

#### Scenario: catalog 覆盖专业写入操作
- **WHEN** generator检查Task专业HTTP catalog
- **THEN** MUST不存在Retrospective写操作
- **AND** Task Record update MUST独立维护文档摘要与决定状态

#### Scenario: catalog 覆盖已迁移的专业读取操作
- **WHEN** generator检查专业Task读取
- **THEN** Review、Verification、Overview与Coordination MUST由同一Schema生成两端DTO
- **AND** 复盘文档读取 MUST属于Task Record catalog

#### Scenario: DTO 变更需要重新生成
- **WHEN** Retrospective operation从catalog删除
- **THEN** generator MUST原子删除两端对应类型
- **AND** check模式 MUST拒绝任一端残留

#### Scenario: 客户端提交非法请求
- **WHEN** 客户端调用旧Retrospective路径或提交已删除字段
- **THEN** HTTP MUST返回not found或稳定validation error
- **AND** MUST保持Task与本机文档零写入

### Requirement: 专业 HTTP 输入必须严格校验且不改变原有边界
Buildr MUST在现有安全检查后，使用strict Draft 2020-12 validator校验仍存在的专业HTTP DTO；validator MUST不自动转换、填充或删除字段。

#### Scenario: 专业读取拒绝未知 query 或字段
- **WHEN** read operation收到Schema白名单外的query、path或body字段
- **THEN** 服务 MUST返回稳定4xx且不调用Application

#### Scenario: Execution Record 保持文件和视图安全白名单
- **WHEN** 已退役Execution Record路径收到请求
- **THEN** 服务 MUST保持not found且不得读取文件

#### Scenario: 专业写入拒绝非法 body 且不变异输入
- **WHEN** 已保留专业写入收到未知、缺失或非法字段
- **THEN** 服务 MUST返回validation error且不变异DTO
- **AND** 旧Retrospective mutation MUST不再注册

### Requirement: Interface DTO 必须显式映射到专业 Application authority
Buildr MUST将校验后的专业Interface DTO显式映射到所属Application；Task Retrospective已无专业Application或mapping。

#### Scenario: 合法专业读取保持既有 Application 结果
- **WHEN** Review、Verification、Overview或Coordination请求通过validator
- **THEN** handler MUST只调用对应Application/read method

#### Scenario: 专业写入保持 digest/conflict/terminal 语义
- **WHEN** 已保留专业mutation触发业务冲突
- **THEN** 服务 MUST保留所属Application错误语义
- **AND** MUST不存在Retrospective digest或处置错误兼容层

### Requirement: 生成 DTO 与 typed Client 必须由同一 Schema 投影
Buildr MUST从当前Task professional Schema确定性生成两端tracked DTO。Retrospective类型从该family删除；复盘文档类型由Task Record Schema生成。

#### Scenario: generated DTO 漂移阻断受影响构建
- **WHEN** 任一tracked DTO与当前Schema不一致
- **THEN** contracts check MUST返回非零并报告drift

#### Scenario: Task Detail 使用 typed professional client
- **WHEN** Task Detail加载Review、Verification、Coordination或本机复盘文档
- **THEN** 专业结果 MUST通过professional client读取，复盘文档 MUST通过Task Record client读取
- **AND** 页面 MUST不手写第二套响应类型
