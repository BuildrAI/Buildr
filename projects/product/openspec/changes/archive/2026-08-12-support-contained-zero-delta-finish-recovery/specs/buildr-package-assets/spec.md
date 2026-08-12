## ADDED Requirements

### Requirement: 产品与自举验证必须覆盖零差异已包含恢复
Buildr package/runtime verification MUST覆盖显式零差异Delivery Adaptation、既有blocked run恢复、activation path保留、stable already-contained交付与target再次前进的fail-closed行为。Buildr Task Finish Skill MUST指导Agent只在完成语义审查后使用显式确认；self-bootstrap runner MUST优先使用additive activation paths并对旧Result回退`changedPaths`。

#### Scenario: 真实 Git remote 中恢复零差异 run
- **WHEN** fixture先让原Task Contribution进入target，再以重叠路径后续提交推进target，并把同一run保留为clean adaptation-required baseline carrier
- **THEN** Agent显式确认后的resume MUST观察到零carrier commit、零fast-forward、零push、零正式Verification执行与成功cleanup
- **AND** Result MUST包含agent-reviewed、zero-delta、already-contained、activation paths与remote readback evidence

#### Scenario: 自举按冻结贡献路径执行
- **WHEN** 零差异carrier的实际changed paths为空，但冻结Task Contribution命中package、CLI或Buildr Web Launcher分类
- **THEN** self-bootstrap plan MUST从activation paths得到完整去重动作
- **AND** MUST完成默认CLI identity与最终Doctor，不得把该任务错误归类为not-applicable

#### Scenario: 未确认或baseline漂移保持阻塞
- **WHEN** fixture省略显式确认、篡改carrier、改变Task source/handoff或在确认后再次推进target
- **THEN** verifier MUST观察到对应input/adaptation/target-race诊断与current token
- **AND** MUST NOT观察到自动Agent review、伪造diff、重复commit、force push或Task提前完成
