## MODIFIED Requirements

### Requirement: Finish carrier 必须由Development证明内容等价
Task Finish MAY 请求Development Application针对一个允许的carrier root重观测complete Content Target，但MUST NOT创建Candidate。请求 MUST同时提供冻结run的`handoffIdentity`、`candidateIdentity`、`candidateGeneration`与`contentTargetIdentity`；只有`observed.currentHandoff`存在、四项精确一致、carrier Content Target与handoff Candidate绑定的target逐component相等且Task context/policy仍current时，Application MUST返回`equivalent`。缺少冻结identity、current handoff不存在或任一identity不一致时，Application MUST返回Development handoff失效及具体mismatch，MUST NOT从历史handoffs选择旧identity。

#### Scenario: 只增加delivery commit
- **WHEN** Finish提供的四项冻结identity全部等于current handoff，且机械提交当前内容但所有scope bytes与逻辑语义未变化
- **THEN** carrier equivalence MUST通过且Candidate identity保持不变
- **AND** commit、branch与ref MUST不进入Content Target或Candidate identity

#### Scenario: carrier prepare改变内容
- **WHEN** rebase、sync、archive、生成或冲突处理改变任一component identity
- **THEN** equivalence MUST失败并判定current handoff失效
- **AND** Finish MUST退出到Development重新验证和生成Candidate

#### Scenario: 历史handoff与current handoff不同
- **WHEN** 请求identity对应历史handoff A，但`observed.currentHandoff`已推进为B
- **THEN** Application MUST返回handoff identity mismatch并指向Task Development
- **AND** MUST NOT因历史receipt仍包含A而返回`equivalent`

#### Scenario: carrier assertion缺少冻结identity
- **WHEN** 调用方未提供四项冻结identity中的任一项
- **THEN** operation MUST以类型化invalid-input失败
- **AND** MUST NOT执行carrier observation或返回宽松currentness结论
