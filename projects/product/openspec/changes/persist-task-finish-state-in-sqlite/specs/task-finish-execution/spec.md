## MODIFIED Requirements

### Requirement: Current run 与结果必须直接表达阶段、失败和效率
Canonical Task Finish MUST在Workspace SQLite唯一current store中写入`buildr.task-finish-run/v2`并返回compact `buildr.task-finish-result/v2`，MUST NOT新建第二个Finish Receipt authority。current run MUST包含Task、Development handoff、Candidate/Content Target、carrier/target identity、五阶段状态与timing、current primary failure、bounded diagnostic、resume/development workflow、固定为0的formal verification execution count、product command observations、CLI invocation count、Agent provider completion count、manual recovery count、wall-clock coverage和cleanup状态。完成后SQLite MUST只保留绑定同一事实的compact terminal Result，并删除current run；Full detail MUST通过有界digest绑定的transient引用提供，MUST不投射Finish-owned change kind、Candidate generation或verification authority。

#### Scenario: 正常路径完成
- **WHEN** 五阶段全部成功或not-applicable，且Finish-owned transient cleanup完成
- **THEN** terminal result MUST报告`status: complete`、durable completion和全部效率字段，且current run MUST不存在
- **AND** MUST明确`formalVerificationExecutions: 0`、`agentProviderCompletions: 0`与`manualRecoveryManifests: 0`

#### Scenario: 中途失败
- **WHEN** 任一阶段blocked或failed
- **THEN** SQLite current run与compact result MUST直接包含phase、operation/check、code/status/exit、diagnostic identity和唯一next workflow/action
- **AND** 已解决的历史失败 MUST NOT继续作为current primary failure

### Requirement: 客户端升级必须直接替换 Task Finish 实现
Buildr Client升级后 MUST直接以Workspace SQLite-backed五阶段执行器替换旧Task Finish实现，并 MUST只使用SQLite run、completion与target lease authority。客户端 MUST NOT继续以`.buildr/task-finish/runs`、`completed`或文件lease作为current authority，也 MUST NOT创建并行协议目录、长期双写、permanent legacy reader或第二套executor。升级 MAY执行一次性、幂等cutover；cutover MUST只导入可由current Task、Development、Git、remote与Environment事实复核的已完成交付摘要，其他legacy run MUST不被恢复。

#### Scenario: 升级后存在旧的未完成 run shape
- **WHEN** legacy File Store中存在未完成、blocked、failed、未知schema或无法复核的run
- **THEN** cutover MUST不导入其token、checkpoint、failure history或lease，新Finish MUST依据current上游与环境事实建立新run
- **AND** 客户端 MUST NOT advance、finalize、转换或继续该旧run

#### Scenario: 升级后存在可验证的已完成交付
- **WHEN** legacy completion与run可安全配对，且Task、handoff、target、remote、Doctor和Environment cleanup事实仍可复核
- **THEN** cutover MUST在单一SQLite transaction中写入compact terminal Result并写后读取验证
- **AND** 只有新Result durable后才 MUST删除对应legacy Finish-owned files

#### Scenario: legacy 路径不安全或清理失败
- **WHEN** cutover发现symlink/path escape、冲突completion或无法删除的legacy文件
- **THEN** Buildr MUST fail closed或报告`legacy_cleanup_pending`，并保留可诊断事实
- **AND** 新writer MUST NOT回退为旧协议写入或形成双写

#### Scenario: 用户不升级客户端
- **WHEN** 用户继续运行旧 Buildr Client
- **THEN** 旧客户端及其旧协议行为不受新客户端代码影响
- **AND** 当前客户端代码库 MUST NOT 为此维护双协议、兼容或状态迁移分支

## ADDED Requirements

### Requirement: Task Finish transient data 必须按 run 登记并在成功后清理
Task Finish MUST只在run-owned transient root保存完整stdout/stderr、命令诊断和Delivery Carrier，并 MUST在Workspace SQLite登记kind、受限locator、SHA-256、大小与retention/cleanup状态。terminal completion MUST仅在Environment cleanup与全部Finish-owned transient cleanup完成后成立；cleanup失败 MUST保持同一run为`cleanup_pending`并支持幂等resume。

#### Scenario: blocked run 保留恢复材料
- **WHEN** current run因target-race、Delivery Adaptation、远端暂态失败或Environment cleanup blocked而可恢复
- **THEN** Buildr MUST保留该run精确恢复所需的registered transient data与lease事实
- **AND** MUST NOT保留无登记文件、其他run内容或把完整日志写入SQLite payload

#### Scenario: Environment 已清理但 Finish transient cleanup 尚未完成
- **WHEN** Environment Receipt已经证明cleaned，但进程在删除diagnostics/Carrier或提交completion前失败
- **THEN** resume MUST只重试Finish-owned cleanup、completion与Task terminal transition
- **AND** MUST NOT重跑prepare、verify、deliver、remote push或Environment provider cleanup

#### Scenario: Finish 成功完成
- **WHEN** delivery、remote readback、retained action、Doctor、Environment cleanup与Finish-owned cleanup全部通过
- **THEN** Buildr MUST释放target lease，删除该run的transient files与current rows，并原子保留compact terminal Result
- **AND** MUST NOT留下`.buildr/task-finish` current files、orphan Carrier或完整命令日志

#### Scenario: transient locator 越界
- **WHEN** registered或发现的artifact locator为绝对路径、逃逸canonical Workspace或经symlink指向run-owned root之外
- **THEN** cleanup MUST拒绝删除并返回安全诊断
- **AND** MUST NOT扩大到Workspace root、其他Task或用户目录
