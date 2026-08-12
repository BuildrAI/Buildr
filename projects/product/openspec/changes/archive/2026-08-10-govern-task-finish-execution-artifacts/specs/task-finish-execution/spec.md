## MODIFIED Requirements

### Requirement: Current run 与结果必须直接表达阶段、失败和效率
Canonical Task Finish MUST在Workspace SQLite唯一`task_finish_current` row中保存`buildr.task-finish-run/v2`所需current事实，并返回compact `buildr.task-finish-result/v2`，MUST NOT新建第二个Finish Receipt authority。普通列 MUST直接表达Task、Development handoff、Candidate/Content Target、carrier/target identity、总体状态、current phase、current primary failure、resume/development workflow、cleanup与terminal association；`phases_json` MUST只保存受验证的固定五阶段current status、timing与下游恢复必需的compact owner facts，有界payload只保存公开结果重建所需的其他非查询详情。阶段attempt的checks、operations、observations、stdout/stderr preview、旧failure history与execution record identity/status MUST NOT写入current row；完成后同一row MUST原位替换为绑定同一事实的compact terminal Result与compact phases，且 MUST不投射Finish-owned change kind或verification authority。

#### Scenario: 正常路径完成
- **WHEN** 五阶段全部成功或not-applicable，且Finish-owned cleanup完成
- **THEN** terminal current row与result MUST报告`status: complete`、durable completion和全部效率字段，且同Task MUST不存在第二份current run、phase或completion authority
- **AND** MUST明确`formalVerificationExecutions: 0`、`agentProviderCompletions: 0`与`manualRecoveryManifests: 0`

#### Scenario: 中途失败
- **WHEN** 任一阶段blocked或failed
- **THEN** SQLite current普通列、compact phases与result MUST共同表达current phase、primary operation/code/status、diagnostic identity和唯一next workflow/action
- **AND** 完整attempt operations、observations、output与已解决历史失败 MUST只进入本invocation diagnostics transient/execution record，不得继续作为current primary事实

#### Scenario: 状态字段与有界详情不一致
- **WHEN** payload中的phase、failure、resume或terminal association与对应普通列不一致
- **THEN** Domain/repository MUST拒绝写入并rollback整个checkpoint
- **AND** reader MUST NOT以JSON、execution record或transient files覆盖普通列或猜测哪一份状态更新

### Requirement: Task Finish transient data 必须按 run 登记并在成功后清理
Task Finish MUST只在run-owned bounded root保存其仍需恢复的Delivery Carrier或临时材料，并在`task_finish_current`的受验证payload中保存精确cleanup locator/status；MUST NOT建立per-artifact SQLite metadata authority。terminal completion MUST仅在Environment cleanup与全部Finish-owned recovery resource cleanup完成后成立；cleanup失败 MUST保持同一current row为`cleanup_pending`并支持幂等resume。独立execution-record producer MUST在单独invocation-owned diagnostics transient中保存完整stdout/stderr与大体量诊断，且其record identity、status、history、body locator与cleanup state MUST NOT写入Finish current或取得Carrier/target/resume authority。

#### Scenario: blocked run 保留恢复材料
- **WHEN** current run因target-race、Delivery Adaptation、远端暂态失败或Environment cleanup blocked而可恢复
- **THEN** Buildr MUST只保留该run精确恢复所需的bounded transient data、carrier locator与内嵌lease事实
- **AND** execution record retained或diagnostics cleanup MUST NOT删除、替代或延长这些Finish-owned恢复材料

#### Scenario: Environment 已清理但 Finish transient cleanup 尚未完成
- **WHEN** Environment Receipt已经证明cleaned，但进程在删除Carrier/临时材料或提交terminal state前失败
- **THEN** resume MUST只重试Finish-owned cleanup、terminal current替换与Task terminal transition
- **AND** MUST NOT重跑prepare、verify、deliver、remote push、Environment provider cleanup或依赖execution record恢复owner facts

#### Scenario: Finish 成功完成
- **WHEN** delivery、remote readback、retained action、Doctor、Environment cleanup与Finish-owned recovery resource cleanup全部通过
- **THEN** Buildr MUST释放内嵌target lease、删除该run的Finish-owned recovery data并原子保留compact terminal current row
- **AND** execution record producer MUST独立按retained-before-cleanup规则处置invocation diagnostics，不得阻止或回滚已成立的Finish completion

#### Scenario: transient locator 越界
- **WHEN** Finish current或diagnostics producer的cleanup locator为绝对路径、逃逸canonical Workspace或经symlink指向owner root之外
- **THEN** 对应owner cleanup MUST拒绝删除并返回安全诊断
- **AND** MUST NOT扩大到另一owner、Workspace root、其他Task或用户目录

## ADDED Requirements

### Requirement: Task Finish execution 必须由 record open gate 启动
Task Finish Application MUST在调用前参数、Task、ready Environment、current Development handoff、target/remote、resume token与completed/no-op判断完成后，为需要真正执行的invocation先open `task-finish/finish-diagnostics` record。open成功前 MUST不创建、替换或失效Finish current，不得创建/删除Carrier、获取lease、启动执行期target mutation/observation、写diagnostics transient、丢弃旧run或改变任何恢复资源；调用前确定target/remote identity所需的只读校验不属于producer execution。

#### Scenario: record capacity backpressure
- **WHEN** 固定record reservation因Task/owner或Workspace quota被拒绝
- **THEN** `task finish run` MUST返回blocked execution record operation summary且不得启动五阶段
- **AND** 既有或缺失的`task_finish_current`、remote ref、Carrier、target lease、resume与恢复资源 MUST逐项保持不变

#### Scenario: open成功后首次执行
- **WHEN** invocation通过校验且record open成功
- **THEN** Application MAY建立invocation diagnostics transient并创建或恢复Finish run，然后按固定五阶段执行
- **AND** 旧failed run/Carrier的任何受控失效或清理 MUST作为本invocation operation发生在open之后

#### Scenario: invalid resume token
- **WHEN** caller对既有blocked或cleanup-pending run提供缺失、不匹配或过期token
- **THEN** Application MUST在record open前拒绝调用并保持current与恢复资源不变
- **AND** MUST返回`executionRecord.status: not-opened`且不得创建diagnostics transient

### Requirement: execution record 失败不得成为第二 Finish terminal authority
Task Finish MUST先按既有owner规则持久化每个阶段、delivery、cleanup与Task terminal事实，再独立seal invocation execution record。record seal、metadata确认或diagnostics cleanup失败 MUST只影响additive execution record operation summary；MUST NOT回滚、重写或重放已成立的Finish current、remote、Environment、Carrier或Task terminal facts。

#### Scenario: Finish complete但record seal失败
- **WHEN** Finish已完成delivery、Environment cleanup、Carrier cleanup与Task terminal transition，但record无法证明retained
- **THEN** result MUST保持`status: complete`并返回`executionRecord.status: attention`与保留transient的next action
- **AND** MUST NOT把Finish改写为blocked/failed、重新创建Carrier、重复push或撤销Task completed

#### Scenario: Finish blocked且record retained
- **WHEN** invocation在target race、Delivery Adaptation、Doctor或cleanup边界停止且record以blocked retained
- **THEN** Finish result MUST保持原current failure、resume token与恢复资源，executionRecord只报告本invocation evidence lifecycle
- **AND** 后续resume MUST创建新record且不得从旧record重建Finish owner state

#### Scenario: task finish inspect
- **WHEN** caller运行只读`task finish inspect`
- **THEN** result MUST只投影`task_finish_current`的current/terminal read model
- **AND** MUST NOT枚举、读取或反向关联execution records，也不得因record attention改变Finish applicability
