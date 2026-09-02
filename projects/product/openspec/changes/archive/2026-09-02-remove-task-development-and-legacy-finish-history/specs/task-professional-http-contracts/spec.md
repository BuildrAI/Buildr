## MODIFIED Requirements

### Requirement: 专业 Task HTTP operation 必须拥有稳定机器契约
Task专业HTTP catalog MUST只覆盖实际存在的Overview、Environment、Review、Verification、Coordination与Retrospective操作。Catalog、schema、mapping和两端DTO MUST不包含Development、Terminal Delivery、旧Finish history或已删除prompt操作。

#### Scenario: 前端读取Review
- **WHEN** Buildr Web请求Task Review或Verification detail
- **THEN** HTTP MUST返回所属Application read model
- **AND** MUST不调用Development、Finish history或prompt generator

#### Scenario: catalog 覆盖专业写入操作
- **WHEN** generator检查Task专业HTTP catalog
- **THEN** MUST覆盖实际存在的Retrospective写操作
- **AND** MUST不登记Development、Finish history或已删除prompt

#### Scenario: catalog 覆盖已迁移的专业读取操作
- **WHEN** generator检查专业Task读取
- **THEN** MUST由同一Schema生成两端DTO并保持no-store与错误契约
- **AND** Review、Verification、Environment与Overview GET MUST只调用所属Application

#### Scenario: DTO 变更需要重新生成
- **WHEN** Development或旧Finish operation从catalog删除
- **THEN** generator MUST原子删除Buildr与Buildr Web DTO中的对应类型和catalog字段
- **AND** check模式 MUST拒绝任一端残留

#### Scenario: 客户端提交非法请求
- **WHEN** 客户端调用Development、Terminal Delivery或旧Finish HTTP路径
- **THEN** HTTP MUST返回not found
- **AND** MUST保持全部Task与专业数据零写入
