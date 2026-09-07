## ADDED Requirements

### Requirement: 发布演练必须在正式选择前构造精确预期发布源
Buildr MUST在不改变正式`release-<version>`、freeze history或公共发布事实的前提下，从current frozen release commit按维护者给出的有序`dev` source commits构造发布演练（Release Rehearsal）commit chain。每个待选commit MUST以`cherry-pick -x`保留来源，演练结果 MUST记录base commit/tree、ordered sources、prospective commit/tree、carrier与稳定identity。

#### Scenario: 构造待选提交的演练源
- **WHEN** 维护者要求对current frozen release与一个或多个current `dev` commits执行发布演练
- **THEN** rehearsal owner MUST在owned临时worktree中从frozen commit按顺序生成带`-x`provenance的prospective source
- **AND** MUST只创建演练lifecycle ref与确定性remote carrier，不得移动正式release branch、current freeze或Task状态

#### Scenario: 演练源发生冲突
- **WHEN** 任一待选commit不能干净应用、已不属于current dev authority或base freeze漂移
- **THEN** rehearsal owner MUST在正式release refs零写入状态停止并报告base、source与冲突路径
- **AND** MUST不自动解决、reset、rebase、force push或扩大待选范围

### Requirement: 失败候选修复必须通过全绿演练原子提升
Current frozen release的Candidate失败后，Buildr MUST要求修复先在support Task交付`dev`并针对current frozen base形成matching passed Release Rehearsal。Selection owner MUST只通过显式`promote-rehearsal`把该exact rehearsal commit/tree提升为新的正式frozen generation，不得先重新打开集合再用正式Candidate逐次发现问题。

#### Scenario: 全绿演练提升为新generation
- **WHEN** 维护者明确确认提升matching passed rehearsal，且目标version仍无tag、npm version、GitHub Release或已开始公共mutation的protected transaction
- **THEN** selection owner MUST重新核验frozen base、ordered source provenance、GitHub run/aggregate、唯一artifact、prospective commit/tree、remote carrier与current dev authority
- **AND** owner MUST保留旧freeze history，将Task release branch和正式release ref仅以fast-forward移动到exact rehearsal commit，并写入新的current/history freeze
- **AND** promotion完成后的release commit/tree MUST与rehearsal evidence逐字匹配

#### Scenario: 演练证据缺失或漂移
- **WHEN** rehearsal未全绿、run或aggregate不匹配、carrier漂移、source不再属于current dev、正式release不是evidence base或出现公共发布事实
- **THEN** promotion MUST在正式release ref与freeze refs零写入状态失败关闭
- **AND** MUST不回退到普通reopen/update、caller布尔值、历史stdout或旧Candidate evidence

### Requirement: 演练资源必须由所有者精确清理
Rehearsal owner MUST只清理identity匹配的临时worktree、本地rehearsal refs与remote carrier，并 MUST保留正式release refs、freeze history、Candidate evidence与支持任务交付。

#### Scenario: 演练提升或放弃后清理
- **WHEN** matching rehearsal已经提升或维护者明确放弃且owner能够证明全部资源identity
- **THEN** cleanup MUST删除owned临时资源与remote carrier并报告逐项effects
- **AND** 任一identity漂移 MUST在删除前fail closed
