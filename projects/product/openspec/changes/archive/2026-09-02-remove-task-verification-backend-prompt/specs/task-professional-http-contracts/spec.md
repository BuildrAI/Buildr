## MODIFIED Requirements

### Requirement: 专业 Task HTTP operation 必须拥有稳定机器契约
Task专业HTTP catalog MUST覆盖实际存在的Overview、Environment、Development、Review、Verification、Coordination与Retrospective操作。Task Verification只保留Workspace-scoped GET detail；catalog、schema、mapping和两端DTO MUST不包含Verification prompt operation。

#### Scenario: 前端读取Review
- **WHEN** Buildr Web请求Task Review detail
- **THEN** HTTP MUST返回独立Review v2 read model
- **AND** MUST不调用Development、Verification或prompt generator

#### Scenario: catalog 覆盖专业写入操作
- **WHEN** generator检查Task专业HTTP catalog
- **THEN** MUST覆盖实际存在的Retrospective写操作
- **AND** MUST不登记已删除的Review或Verification prompt操作

#### Scenario: catalog 覆盖已迁移的专业读取操作
- **WHEN** generator检查专业Task读取
- **THEN** MUST由同一Schema生成两端DTO并保持no-store与错误契约
- **AND** Verification GET MUST只调用所属Application read model

#### Scenario: DTO 变更需要重新生成
- **WHEN** prompt schema从catalog删除
- **THEN** generator MUST原子删除Buildr与Buildr Web DTO中的对应类型和catalog字段
- **AND** check模式 MUST拒绝任一端残留

#### Scenario: 客户端提交非法请求
- **WHEN** 客户端调用已删除的Verification prompt路径
- **THEN** HTTP MUST返回not found且零写入
