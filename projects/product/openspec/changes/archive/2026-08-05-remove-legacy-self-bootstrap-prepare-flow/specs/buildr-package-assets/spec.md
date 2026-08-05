## ADDED Requirements

### Requirement: 产品验证必须覆盖已包含交付与post-Finish自举
Buildr package与runtime verification MUST覆盖Task Finish `already-contained` target disposition和自举Workspace post-Finish activation，并证明普通用户Workspace、通用Task Finish Skill和Product executor不获得self-bootstrap专属依赖或Component诊断分支。

#### Scenario: 验证 already-contained 快速完成
- **WHEN** integration fixture先交付carrier，再以保留全部carrier changed path after states的后续commit推进target
- **THEN** verifier MUST观察到零Task Contribution reapply、零新carrier commit、零Formal Verification execution和成功cleanup
- **AND** Result MUST包含ancestor/path-state containment evidence、原carrier ref和最新final remote ref

#### Scenario: 验证同路径变化仍fail closed
- **WHEN** 后续target commit改变任一carrier-owned path或无法读取target identity
- **THEN** verifier MUST观察到现有target-race或Delivery Adaptation路径
- **AND** MUST NOT观察到`already-contained`、自动冲突解决、Candidate rebuild或force push

#### Scenario: 验证自举只在Formal Finish后激活
- **WHEN** Buildr自举fixture的Formal Finish成功且冻结Task Contribution命中自举影响路径
- **THEN** verifier MUST观察到Finish五阶段先完成，随后单一post-Finish activation按路径去重执行适用动作与最终Doctor
- **AND** Formal Finish MUST不执行package sync、development CLI install或development Local App install

#### Scenario: 验证普通 Workspace 不采用自举activation
- **WHEN** 未安装`buildr-self-bootstrap` Component的临时Workspace完成相同Formal Finish
- **THEN** Task Finish MUST保持通用Result、Doctor与cleanup行为
- **AND** runtime/package MUST不存在self-bootstrap slot、隐式dependency、路径分类或executor特判

## REMOVED Requirements

### Requirement: 产品验证必须覆盖已包含交付与两段式自举
**Reason**: “两段式自举”仍授权pre-Finish prepare/publish验证，与单一post-Finish activation互斥。

**Migration**: 使用“产品验证必须覆盖已包含交付与post-Finish自举”。
