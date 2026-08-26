## ADDED Requirements

### Requirement: Agent-reviewed Delivery Adaptation 必须覆盖全部 Task Contribution 路径
Task Finish MUST 在采用 Agent-reviewed Delivery Carrier 前，从冻结 Task Contribution 派生完整变更路径集合，并为每个路径形成唯一处置：目标精确包含 after state、carrier 相对 delivery baseline 实际改变该路径，或 Agent 显式确认目标现状已语义承接并提供非空逐路径理由。三类处置并集 MUST 精确覆盖 Task Contribution 路径；Buildr MUST只证明路径集合、Git bytes、identity与输入闭合，不得把 Agent 判断描述为机器证明的语义等价。

#### Scenario: carrier 只包含冲突文件
- **WHEN** 原 Task Contribution 包含多个路径，而 adapted carrier 只改变其中一部分，目标也未精确包含其余路径，且没有逐路径 Agent 处置
- **THEN** carrier adoption MUST以稳定缺失路径诊断 blocked
- **AND** deliver、Task completion 与 cleanup proof MUST不得把该 carrier 报告为完整交付

#### Scenario: 目标已精确包含任务内容
- **WHEN** 某个 Task Contribution 路径的 after state 已由当前 target精确包含
- **THEN** Buildr MUST自动把该路径分类为`target-contained`
- **AND** Agent MUST不需要为该路径重复提交人工判断

#### Scenario: Agent 确认目标语义承接
- **WHEN** 某个路径既非精确包含、carrier也未改变，但 Agent通过current run resume显式提交该路径及非空理由
- **THEN** Buildr MAY把该路径分类为`agent-reviewed-target`
- **AND** proof MUST明确其语义等价未由 Buildr 证明，不得把一次 task-wide review 隐式应用到其他路径

#### Scenario: coverage 输入无效
- **WHEN** Agent提交Task Contribution之外的路径、重复处置、空理由、陈旧run/resume identity或与current carrier/target不匹配的覆盖输入
- **THEN** 整个 adoption MUST零写入失败并保留当前 run/carrier现场
- **AND** Result MUST返回冲突路径与重新inspect current run的恢复方向

### Requirement: Delivery path coverage proof 必须贯穿交付与清理
Task Finish MUST把路径覆盖事实作为现有 Delivery Carrier proof 的关闭字段并形成稳定identity。Carrier复核、remote delivery readback与Environment cleanup proof MUST重验同一 Task Contribution、delivery baseline、carrier tree、target ref与coverage identity；任一漂移 MUST使旧proof stale或blocked。系统 MUST NOT为路径覆盖创建独立数据库表、第二Result、事件历史或跨run cache。

#### Scenario: adoption 后 carrier 漂移
- **WHEN** coverage proof形成后carrier tree、delivery baseline、Task Contribution或逐路径处置发生变化
- **THEN** deliver MUST拒绝旧proof并报告对应identity drift
- **AND** MUST不自动重做语义处置、重试或修改原Task worktree

#### Scenario: remote 与 proof 一致
- **WHEN** remote target包含已交付carrier，且Task Contribution、carrier与coverage proof identities全部current
- **THEN** Delivery readback与cleanup proof MUST复用同一coverage identity证明完整交付
- **AND** compact结果 MUST只返回分类计数、必要路径诊断与稳定identity，不复制完整diff或stdout

#### Scenario: 自动 Finish 路径受阻
- **WHEN** 路径覆盖无法证明但Agent选择PR或直接Git完成交付
- **THEN** Buildr MUST允许对应外部Git工作按其自身授权继续
- **AND** 后续Delivery Reconciliation MUST从真实remote target重新证明交付，不得复用被阻断的carrier claim
