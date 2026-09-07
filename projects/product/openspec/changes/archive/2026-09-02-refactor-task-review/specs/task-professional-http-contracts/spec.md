## MODIFIED Requirements

### Requirement: 专业 Task HTTP operation 必须拥有稳定机器契约
Task Review HTTP MUST只保留Workspace-scoped GET detail，返回所属Application的v2 read model。HTTP catalog、Schema与两端DTO MUST删除Review prompt request/response；其他专业operation保持各自owner。

#### Scenario: 前端读取Review
- **WHEN** Buildr Web请求Task Review detail
- **THEN** HTTP MUST返回两个v2 current slots且不包含applicability
- **AND** MUST不调用Development、Terminal或prompt generator

#### Scenario: catalog 覆盖专业写入操作
- **WHEN** generator检查Task专业HTTP catalog
- **THEN** MUST继续覆盖实际存在的专业写操作
- **AND** MUST不登记已删除的Task Review prompt写操作

#### Scenario: catalog 覆盖已迁移的专业读取操作
- **WHEN** generator检查Task Review detail
- **THEN** MUST由同一Schema生成Buildr与Buildr Web DTO
- **AND** MUST保持GET no-store、Workspace scope和错误契约
