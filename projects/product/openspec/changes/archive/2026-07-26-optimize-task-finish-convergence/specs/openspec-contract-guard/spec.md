## MODIFIED Requirements

### Requirement: 同步结果必须符合 delta 且保持未触达契约
Buildr MUST 使用成功 pre-sync 产生的 receipt 验证同步结果，只有 delta 结果成立且未触达 Requirement 保持不变时才能通过 post-sync。post-sync failure finding MUST 提供 capability、Requirement、operation、可比较的 expected/actual 摘要与确定性的 next action；诊断不得自动修改 canonical specs、delta 或 baseline。

#### Scenario: 安全同步完整通过
- **WHEN** ADDED、MODIFIED、REMOVED 和 RENAMED 结果均符合 delta，且 receipt 中未触达 Requirement 未变化
- **THEN** post-sync check MUST 成功
- **AND** JSON 输出 MUST 将 change 状态报告为 contract-applied

#### Scenario: 未声明的 Requirement 被删除或改写
- **WHEN** 同步结果删除、增加或改变 delta 未触达的 Requirement
- **THEN** post-sync check MUST 失败
- **AND** finding MUST 标识 capability、Requirement 和预期/实际摘要

#### Scenario: MODIFIED 使用不完整结果
- **WHEN** post-sync canonical Requirement 不匹配 delta 中声明的完整 MODIFIED Requirement
- **THEN** post-sync check MUST 失败
- **AND** finding MUST 返回 operation、expected/actual 摘要和“从 delta Requirement 全文重建 canonical 后重跑 post-sync”的 next action

#### Scenario: Delta 在 pre-sync 后变化
- **WHEN** receipt 记录的 delta hash 与 post-sync 时 delta 不同
- **THEN** post-sync check MUST 失败
- **AND** Buildr MUST 要求重新执行 pre-sync

#### Scenario: canonical 在 pre-sync 前已被写入
- **WHEN** pre-sync 发现 touched canonical Requirement 不再匹配 baseline，且没有当前 change 的有效 receipt
- **THEN** finding MUST 明确要求恢复或审阅 canonical facts 后再创建新的 pre-sync receipt
- **AND** Buildr MUST NOT 将现有 canonical 内容自动采纳为该 Change 的同步结果
