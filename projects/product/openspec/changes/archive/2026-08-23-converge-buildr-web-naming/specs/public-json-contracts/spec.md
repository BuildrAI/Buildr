## ADDED Requirements

### Requirement: Publication platform 必须新写入 Buildr Web 并兼容读取旧值
publication platform 的 canonical writer MUST 写入 `buildr-web`；reader MUST 接受 `buildr-web` 与历史 `local-app` 并将两者投影为 Buildr Web。未知值 MUST fail closed。

#### Scenario: 读取历史 publication
- **WHEN** reader 收到 platform 值 `local-app`
- **THEN** reader MUST 成功解析并向用户展示 Buildr Web

#### Scenario: 写入当前 publication
- **WHEN** Buildr 生成或更新 publication target
- **THEN** payload MUST 使用 `buildr-web`
- **AND** 不得生成新的 `local-app` canonical payload

#### Scenario: 拒绝未知 platform
- **WHEN** reader 收到未登记的 platform 值
- **THEN** 解析 MUST fail closed 并返回稳定诊断

