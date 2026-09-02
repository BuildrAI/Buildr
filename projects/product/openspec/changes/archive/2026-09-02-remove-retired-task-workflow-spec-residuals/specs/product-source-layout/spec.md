## ADDED Requirements

### Requirement: 迁移期兼容 Runtime 必须只覆盖仍存在的能力
迁移期compatibility port MUST具有明确owner、scope与退出条件，并 MUST不为已退役Task Development、Planning Identity、legacy Finish或Terminal Delivery保留转发、双读或双写。

#### Scenario: 保留能力仍通过兼容port读取Task Record
- **WHEN** Review、Verification、Retrospective或Environment尚未完成结构迁移
- **THEN** compatibility port MAY转发到唯一Task Record owner
- **AND** MUST不恢复已退役模块

## REMOVED Requirements

### Requirement: 迁移期兼容 Runtime 必须有界且可退出
**Reason**: 场景仍把Task Development与Finish列为待迁移当前能力。
**Migration**: 兼容边界只覆盖仍存在能力。
