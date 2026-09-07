## ADDED Requirements

### Requirement: 候选准备必须先演练后正式确认
Buildr候选准备 MUST把可反复修复的Release Rehearsal与只执行一次的最终Candidate分开。Candidate失败后的代码或流程修复 MUST先在support Task和prospective release tree上反复演练到全绿，再由维护者显式提升为正式release generation并运行一次最终Candidate确认。

#### Scenario: 支持任务修复尚未演练全绿
- **WHEN** 修复已经交付`dev`但matching prospective release tree的完整Release Rehearsal尚未passed
- **THEN** 发布流程 MUST保持current正式release freeze不变并继续在同一support Task处理全部演练失败
- **AND** MUST不请求reopen、创建新正式generation、运行最终Candidate或进入release-to-main

#### Scenario: 演练全绿后进入最终确认
- **WHEN** matching Release Rehearsal全绿且维护者明确授权promotion
- **THEN** 发布流程 MUST提升exact rehearsal commit/tree并运行一次final Candidate
- **AND** 在final Candidate及后续readiness全部成立前 MUST不dispatch publish workflow或产生tag、npm、GitHub Release副作用
