## MODIFIED Requirements

### Requirement: 开发反馈、候选门禁与发布验证必须分离
Buildr release workflow MUST区分PR到`dev`的changed/affected反馈、`dev → main`的分布式完整Candidate与tag workflow的正式发布物验证；Formal Finish或self-bootstrap successor直接推送`dev` MUST NOT自动启动GitHub Product verification，普通发布准备 MUST NOT无条件在本机和GitHub重复完整Candidate。

#### Scenario: PR向Dev提交开发修改
- **WHEN** 外部贡献、普通feature branch或需要hosted跨平台反馈的修改通过PR进入`dev`
- **THEN** CI MUST运行可解释的changed/affected反馈并保留适用Windows高风险结果
- **AND** 该反馈 MUST NOT被描述为完整Candidate

#### Scenario: Dev收到新提交
- **WHEN** Formal Finish把已完成正式Verification的source commit推送到`dev`，或self-bootstrap runner随后推送retained Workspace activation successor
- **THEN** GitHub `Verify Buildr` MUST NOT因该`dev` push自动启动
- **AND** source commit的正确性 MUST由current Task Verification与Finish remote readback证明
- **AND** successor的收敛 MUST由self-bootstrap runner的精确delta、push readback、development identity与最终Doctor证明

#### Scenario: 准备候选版
- **WHEN** 冻结候选需要进入`main`
- **THEN** GitHub分布式aggregate gate MUST作为完整Candidate权威
- **AND** 本地默认验证 MUST使用changed/focus/affected结果
- **AND** 只有验证框架自身变化、故障诊断或GitHub不可用等明确场景才要求额外本地完整Candidate

#### Scenario: 迁移分支保护
- **WHEN** 新aggregate check尚未在实际PR head SHA上通过并完成回读
- **THEN** 旧required contexts MUST继续保留
- **AND** 新gate稳定后才可切换required contexts并删除旧名称
