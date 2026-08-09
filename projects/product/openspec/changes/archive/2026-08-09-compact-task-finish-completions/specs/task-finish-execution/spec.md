## MODIFIED Requirements

### Requirement: Current run 与结果必须直接表达阶段、失败和效率
Canonical Task Finish MUST在Workspace SQLite唯一`task_finish_current` row中保存`buildr.task-finish-run/v2`所需current事实，并返回compact `buildr.task-finish-result/v2`，MUST NOT新建第二个Finish Receipt authority。普通列 MUST直接表达Task、Development handoff、Candidate/Content Target、carrier/target identity、总体状态、current phase、current primary failure、resume/development workflow、cleanup与terminal association；`phases_json` MUST保存受验证的固定五阶段状态与timing，有界payload只保存公开结果重建所需的其他非查询详情。完成后同一row MUST原位替换为绑定同一事实的compact terminal Result与compact phases；MUST不投射Finish-owned change kind、verification authority或execution-record producer状态。

#### Scenario: 正常路径完成
- **WHEN** 五阶段全部成功或not-applicable，且Finish-owned cleanup完成
- **THEN** terminal current row与result MUST报告`status: complete`、durable completion和全部效率字段，且同Task MUST不存在第二份current run、phase或completion authority
- **AND** MUST明确`formalVerificationExecutions: 0`、`agentProviderCompletions: 0`与`manualRecoveryManifests: 0`

#### Scenario: 中途失败
- **WHEN** 任一阶段blocked或failed
- **THEN** SQLite current普通列、受验证phases JSON与compact result MUST共同表达phase、operation/check、code/status/exit、diagnostic identity和唯一next workflow/action
- **AND** 已解决的历史失败 MUST NOT继续作为current primary failure

#### Scenario: 状态字段与有界详情不一致
- **WHEN** payload中的phase、failure、resume或terminal association与对应普通列不一致
- **THEN** Domain/repository MUST拒绝写入并rollback整个checkpoint
- **AND** reader MUST NOT以JSON覆盖普通列或猜测哪一份状态更新

### Requirement: 客户端升级必须直接替换 Task Finish 实现
Buildr Client升级后 MUST直接以Workspace SQLite-backed五阶段执行器替换旧Task Finish实现，并 MUST只使用`task_finish_current`及行内嵌target lease authority。客户端 MUST NOT继续使用SQLite旧四表、`.buildr/task-finish/runs`、`completed`或文件lease作为current authority，也 MUST NOT创建并行协议目录、长期双写、permanent legacy reader、cutover adapter或第二套executor。旧File Store数据 MUST不被迁移或恢复；旧SQLite专业数据只允许由连续migration一次性安全收敛。

#### Scenario: 升级后存在旧的未完成 run shape
- **WHEN** SQLite-only runtime启用前发现旧File Store中存在未完成、blocked、failed、未知schema或无法复核的run
- **THEN** 受控升级步骤 MUST直接删除旧目录；新Finish MUST依据SQLite current上游与环境事实建立新run
- **AND** 客户端 MUST NOT读取、导入、advance、finalize、转换或继续该旧File Store run

#### Scenario: 升级后存在可验证的已完成交付
- **WHEN** SQLite-only runtime启用前发现旧File Store中存在看似已完成的run/completion
- **THEN** 受控升级步骤 MUST直接删除旧目录，不得配对、导入或恢复其completion
- **AND** 新Result MUST只由SQLite-backed Finish重新产生

#### Scenario: 升级已有 SQLite Finish 状态
- **WHEN** canonical Workspace Structured Store仍使用旧run/completion/lease/artifact四表且数据可证明一致
- **THEN** retained migration MUST将其收敛到`task_finish_current`并删除旧四表
- **AND** 新runtime MUST不保留旧表reader、writer、view、trigger或长期兼容分支

#### Scenario: SQLite 旧状态无法安全迁移
- **WHEN** 旧SQLite状态存在损坏identity、phase、lease owner或未完成artifact cleanup
- **THEN** migration MUST fail closed并完整rollback
- **AND** 新writer MUST NOT部分启用新schema、丢弃旧状态或形成双写

#### Scenario: legacy 路径不安全或清理失败
- **WHEN** 受控清理发现旧目录存在symlink、path escape或无法删除的文件
- **THEN** Buildr MUST fail closed，不得把旧文件作为Finish输入
- **AND** 新writer MUST NOT回退为旧协议写入或形成双写

#### Scenario: 用户不升级客户端
- **WHEN** 用户继续运行旧 Buildr Client
- **THEN** 旧客户端及其旧协议行为不受新客户端代码影响
- **AND** 当前客户端代码库 MUST NOT 为此维护双协议、兼容或状态迁移分支

### Requirement: Task Finish transient data 必须按 run 登记并在成功后清理
Task Finish MUST只在run-owned bounded root保存其仍需恢复的Delivery Carrier或临时材料，并在`task_finish_current`的受验证payload中保存精确cleanup locator/status；MUST NOT建立per-artifact SQLite metadata authority。terminal completion MUST仅在Environment cleanup与全部Finish-owned cleanup完成后成立；cleanup失败 MUST保持同一current row为`cleanup_pending`并支持幂等resume。完整stdout/stderr或大体量诊断若由独立execution-record producer持有，Finish current MAY只保存其有界digest association，但本能力 MUST NOT代替或自动创建该producer。

#### Scenario: blocked run 保留恢复材料
- **WHEN** current run因target-race、Delivery Adaptation、远端暂态失败或Environment cleanup blocked而可恢复
- **THEN** Buildr MUST只保留该run精确恢复所需的bounded transient data、carrier locator与内嵌lease事实
- **AND** MUST NOT保留无owner文件、其他run内容、per-artifact table row或把完整日志写入SQLite payload

#### Scenario: Environment 已清理但 Finish transient cleanup 尚未完成
- **WHEN** Environment Receipt已经证明cleaned，但进程在删除Carrier/临时材料或提交terminal state前失败
- **THEN** resume MUST只重试Finish-owned cleanup、terminal current替换与Task terminal transition
- **AND** MUST NOT重跑prepare、verify、deliver、remote push或Environment provider cleanup

#### Scenario: Finish 成功完成
- **WHEN** delivery、remote readback、retained action、Doctor、Environment cleanup与Finish-owned cleanup全部通过
- **THEN** Buildr MUST释放内嵌target lease、删除该run的Finish-owned transient data并原子保留compact terminal current row
- **AND** MUST NOT留下`.buildr/task-finish` current files、orphan Carrier、旧四表row或完整命令日志

#### Scenario: transient locator 越界
- **WHEN** current payload中的cleanup locator为绝对路径、逃逸canonical Workspace或经symlink指向run-owned root之外
- **THEN** cleanup MUST拒绝删除并返回安全诊断
- **AND** MUST NOT扩大到Workspace root、其他Task或用户目录
