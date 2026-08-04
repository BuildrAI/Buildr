## ADDED Requirements

### Requirement: Package verification 必须保护 OpenSpec checklist 与 lifecycle authority parity
Buildr package、workspace source与rendered runtime MUST投射一致的OpenSpec propose/update/apply contributions，并通过static/contract verification拒绝Task Finish convergence/archive旧authority和post-archive lifecycle checkbox引导。Package verification MUST证明convergence的未完成checklist门禁存在，且Metadata Publication保持只发布writer-owned portable Task records。

#### Scenario: 校验OpenSpec Component contributions
- **WHEN** verifier检查package source、workspace Component source与rendered OpenSpec Skills
- **THEN** 三者 MUST一致声明Change checklist的pre-disposition边界和未完成项fail-closed要求
- **AND** current assets MUST不包含“Task Finish执行或拥有OpenSpec convergence/archive”的可用路由

#### Scenario: 校验Metadata Publication边界
- **WHEN** verifier扫描checklist修复相关的Skill、contract与测试
- **THEN** Metadata Publication MUST仍排除`tasks.md`、Environment与Finish evidence
- **AND** MUST不新增archive reconciliation、checklist writer或第二份lifecycle状态
