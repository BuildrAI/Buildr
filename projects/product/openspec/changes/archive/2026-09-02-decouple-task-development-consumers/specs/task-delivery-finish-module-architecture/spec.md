## ADDED Requirements

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
