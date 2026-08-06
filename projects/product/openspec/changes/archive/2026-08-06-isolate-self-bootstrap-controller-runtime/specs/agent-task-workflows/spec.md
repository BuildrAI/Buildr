## ADDED Requirements

### Requirement: self-bootstrap 最终候选验证必须按实质身份变化重建或复用 evidence
Buildr self-bootstrap workflow MUST 将候选验证绑定到 Content Target、runtime identity、migration identity、verification declaration 与 validation-store baseline。rebase、冲突解决或集成准备后，若这些输入发生实质变化，workflow MUST 在最终候选上重新执行受影响验证；migration identity 改变时 MUST 丢弃旧 validation store 并从最新 retained baseline 重建完整 migration chain。若 workflow 能证明所有绑定输入未变，MUST 只执行最终 identity check 并可复用既有验证 evidence。

#### Scenario: migration 重编号后准备集成
- **WHEN** 并发 Task 使 candidate migration 的文件名、编号或 identity 在 rebase/冲突解决中变化
- **THEN** workflow MUST 丢弃旧 validation store 并在最新 retained baseline 上重建它
- **AND** MUST 重跑完整 migration chain、SQLite 验证和受影响功能验证后才可形成最终 Candidate

#### Scenario: retained baseline 前进但最终候选未变
- **WHEN** retained branch 前进，但 Task 的 Content Target、runtime identity、migration identity、verification declaration 与受影响范围可证明均未变化
- **THEN** workflow MUST 记录最终 identity check 并可复用既有验证 evidence
- **AND** MUST NOT 仅因 rebase 动作机械要求全量 Candidate 验证
