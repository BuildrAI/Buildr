## MODIFIED Requirements

### Requirement: 迁移期兼容 Runtime 必须只覆盖仍存在的能力
迁移期compatibility port MUST具有明确owner、scope与退出条件，并 MUST不为已退役Task Development、Planning Identity、Environment、Retrospective Application、legacy Finish或Terminal Delivery保留转发、双读或双写。

#### Scenario: 保留能力仍通过兼容port读取Task Record
- **WHEN** Review或Verification仍通过compatibility port读取Task Record
- **THEN** port MAY转发到唯一Task Record owner
- **AND** MUST不恢复Environment、Retrospective Application或其他已退役模块
