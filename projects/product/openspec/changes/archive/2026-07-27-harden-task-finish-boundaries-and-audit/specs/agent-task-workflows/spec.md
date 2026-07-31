## ADDED Requirements

### Requirement: Agent 只能处理收敛事务外的语义决定
Agent MUST 将 Buildr 的确定性收敛结果视为产品事实：`passed` 继续收尾，`blocked` 只处理最小语义冲突，`recovery-unprovable` 停止并进行人工检查。Agent MUST NOT 手工恢复正式规范、刷新基线、选择内部恢复阶段、拼装旧门禁命令，或用自报成功证据覆盖产品失败。

#### Scenario: 产品报告状态无法证明
- **WHEN** `buildr openspec converge` 或只读审计返回 `recovery-unprovable`
- **THEN** Agent MUST 停止正式文件写入并向用户报告逐文件事实
- **AND** MUST NOT 删除回执、刷新 baseline 或尝试从旧阶段继续

#### Scenario: 产品报告确定性通过
- **WHEN** `buildr openspec converge` 返回 `passed`
- **THEN** Agent MUST 直接消费该结果继续 Task Finish
- **AND** MUST NOT 重演 planner、validator、applier、observer 或 archive 内部步骤

