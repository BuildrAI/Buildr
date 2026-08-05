## ADDED Requirements

### Requirement: 产品验证必须覆盖已包含交付与两段式自举
Buildr package与runtime verification MUST覆盖Task Finish `already-contained` target disposition和自举Workspace prepare/publish时序，并证明普通用户Workspace、通用Task Finish Skill和Product executor不获得self-bootstrap专属依赖或Component诊断分支。

#### Scenario: 验证 already-contained 快速完成
- **WHEN** integration fixture先交付carrier，再以保留全部carrier changed path after states的后续commit推进target
- **THEN** verifier MUST观察到零Task Contribution reapply、零新carrier commit、零Formal Verification execution和成功cleanup
- **AND** Result MUST包含ancestor/path-state containment evidence、原carrier ref和最新final remote ref

#### Scenario: 验证同路径变化仍fail closed
- **WHEN** 后续target commit改变任一carrier-owned path或无法读取target identity
- **THEN** verifier MUST观察到现有target-race或Delivery Adaptation路径
- **AND** MUST NOT观察到`already-contained`、自动冲突解决、Candidate rebuild或force push

#### Scenario: 验证自举prepare不提前push
- **WHEN** Buildr自举fixture因唯一`components.update_available` finding进入专属prepare路径
- **THEN** verifier MUST观察到sync managed delta形成clean本地commit但remote仍等于Formal carrier
- **AND** 只有Formal Finish成功后才观察到该commit的普通push、readback与最终Doctor

#### Scenario: 验证普通 Workspace 不采用自举恢复
- **WHEN** 未安装`buildr-self-bootstrap` Component的临时Workspace遇到相同Doctor finding
- **THEN** Task Finish MUST保持原blocked Result和精确resume action
- **AND** runtime/package MUST不存在self-bootstrap slot、隐式dependency或executor特判
