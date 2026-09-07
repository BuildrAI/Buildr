## MODIFIED Requirements

### Requirement: 专业 Task HTTP operation 必须拥有稳定机器契约
Task专业HTTP catalog MUST只覆盖实际存在的Review、Verification与Parent Coordination读取。Task Overview、Retrospective旧接口、Execution Record和prompt operation MUST不存在。每个response MUST使用closed JSON Schema，并由同一源生成后端与Buildr Web DTO。

#### Scenario: 前端读取专业结果
- **WHEN** Buildr Web请求Review、Verification或Parent Coordination
- **THEN** HTTP MUST返回所属Application read model并通过closed response schema
- **AND** 生成DTO MUST提供实际字段而不是`unknown`索引签名

#### Scenario: 客户端请求 Task Overview
- **WHEN** client请求旧`/tasks/:taskId/overview`
- **THEN** HTTP MUST返回not found且零写入
- **AND** MUST不转发到Task detail或专业inspect

#### Scenario: DTO 漂移
- **WHEN** 任一tracked DTO与Schema不一致
- **THEN** contracts check MUST失败并列出drift

#### Scenario: 前端读取Review
- **WHEN** Buildr Web请求Task Review或Verification detail
- **THEN** HTTP MUST返回所属Application read model
- **AND** MUST不调用Overview、Retrospective、Development或prompt generator

#### Scenario: catalog 覆盖专业写入操作
- **WHEN** generator检查Task professional catalog
- **THEN** MUST不存在Overview或Retrospective写操作

#### Scenario: catalog 覆盖已迁移的专业读取操作
- **WHEN** generator检查专业Task读取
- **THEN** Review、Verification与Parent Coordination MUST由同一Schema生成两端DTO
- **AND** 复盘文档读取 MUST属于Task Record catalog

#### Scenario: DTO 变更需要重新生成
- **WHEN** Overview operation从catalog删除
- **THEN** generator MUST原子删除两端对应类型
- **AND** check模式 MUST拒绝任一端残留

#### Scenario: 客户端提交非法请求
- **WHEN** 客户端调用旧Overview路径或提交已删除字段
- **THEN** HTTP MUST返回not found或稳定validation error
- **AND** MUST保持全部Task事实零写入

### Requirement: Interface DTO 必须显式映射到专业 Application authority
Buildr MUST将校验后的Review、Verification与Parent Coordination Interface DTO映射到所属Application；MUST不存在Overview、Retrospective、Execution Record或prompt mapping。

#### Scenario: 合法专业读取
- **WHEN** 保留的专业GET通过validator
- **THEN** handler MUST只调用对应Application/read method

#### Scenario: 已删除 operation
- **WHEN**旧Overview或prompt route收到请求
- **THEN** MUST不调用任何专业Application或writer

#### Scenario: 合法专业读取保持既有 Application 结果
- **WHEN** Review、Verification或Parent Coordination请求通过validator
- **THEN** handler MUST只调用对应Application/read method

#### Scenario: 专业写入保持 digest/conflict/terminal 语义
- **WHEN** 已保留专业mutation触发业务冲突
- **THEN** 服务 MUST保留所属Application错误语义
- **AND** MUST不存在Overview兼容层

### Requirement: 生成 DTO 与 typed Client 必须由同一 Schema 投影
Buildr MUST从当前Task professional Schema确定性生成两端tracked DTO和Buildr Web typed client类型。生成结果 MUST只包含Review、Verification、Parent Coordination和error family。

#### Scenario: Buildr Web读取专业结果
- **WHEN** Task Detail加载证据或父任务协调
- **THEN** 页面 MUST通过typed professional client读取
- **AND** MUST不手写第二套响应类型或Overview client

#### Scenario: generated DTO 漂移阻断受影响构建
- **WHEN** 任一tracked DTO与当前Schema不一致
- **THEN** contracts check MUST返回非零并报告drift

#### Scenario: Task Detail 使用 typed professional client
- **WHEN** Task Detail加载Review、Verification或Parent Coordination
- **THEN** MUST通过professional client读取
- **AND** 页面 MUST不维护Overview client

## REMOVED Requirements

### Requirement: Task Verification HTTP必须只公开报告读取和Agent提示
**Reason**: 后端Agent prompt已在既有重构中删除，当前规范落后。
**Migration**: 只保留Verification report GET；Agent指令由Skill与前端形成。
