## ADDED Requirements

### Requirement: Finish producer 必须把每次 invocation 映射为独立 closed execution record
Registered Task Finish runner MUST把每次通过调用前校验且真正开始执行的 invocation 映射为一条`task-finish/finish-diagnostics` record。`run_identity` MUST使用执行前生成的独立 Finish invocation identity，`target_identity` MUST使用Development handoff中的stable Content Target identity，`producer` MUST使用稳定registered identity；逻辑`finishRunId`、invocation ordinal、Candidate/handoff、target与Carrier facts MUST进入受控正文而不是新增SQLite列、任意metadata或retry/Consumer关系。

#### Scenario: 首次 Finish invocation metadata 映射
- **WHEN** caller已通过Task、Environment、Development handoff、target/remote与no-op校验并生成Finish invocation identity
- **THEN** producer MUST以`taskId + task-finish + finish-diagnostics + finishInvocationId`幂等open record并绑定Content Target identity
- **AND** Finish current run、Carrier、target lease与其他execution side effect MUST只在open成功后创建

#### Scenario: 同一 Finish run 恢复
- **WHEN** blocked或cleanup-pending Finish run使用matching product resume token再次执行
- **THEN** resume invocation MUST生成新的Finish invocation identity与独立record，并在正文引用原`finishRunId`和新ordinal
- **AND** MUST NOT覆盖旧blocked record、自动建立retry/recovered关系或把record identity写入`task_finish_current`

#### Scenario: invalid或no-op Finish invocation
- **WHEN** request参数、Task/Environment/handoff、target/remote、resume token不合法，或既有Finish已经complete而本次只返回no-op
- **THEN** producer MUST NOT打开record、预留quota或创建diagnostics transient
- **AND** MUST NOT借execution record改变既有Finish current、Carrier、target或terminal facts

### Requirement: Finish record 正文必须使用 closed invocation diagnostics dictionary
Finish producer MUST只提交既有closed正文文件名。`summary.json` MUST保存versioned portable invocation/run/ordinal、handoff/Candidate/Content Target、target/Carrier identity、固定phase status/timing、Finish outcome与cleanup disposition；`timeline.json` MUST只保存closed record/run/phase/stop/seal milestones；`diagnostics.json` MUST只保存本invocation的failure、target race、adaptation、Doctor、cleanup与cancellation diagnostics；stdout/stderr MUST按固定phase与operation边界保存。Producer MUST在persistent write前移除transient/Carrier locator、本机root/executable、remote credential、lease/resume/resource token、env、stdin、cwd与raw argv，并 MUST继续由正文Store执行最终redaction和截断。

#### Scenario: Finish complete seal
- **WHEN**五阶段完成且producer形成完整invocation正文
- **THEN** producer MUST提交`summary.json`、适用output与timeline并以`passed` seal
- **AND** SQLite MUST只保存既有body locator/digest/size/truncation与governance metadata

#### Scenario: blocked或failed Finish seal
- **WHEN** invocation因target race、Delivery Adaptation、Doctor、cleanup或产品执行失败停止且已有terminal诊断
- **THEN** producer MUST分别以`blocked`或`failed` seal并提交diagnostics与已有partial output
- **AND** diagnostics MUST只包含portable code/class/operation/status/ref identity与有界findings，不得包含恢复token或本机locator

#### Scenario: catchable cancellation
- **WHEN** runner有界捕获取消或signal并能收敛已启动命令与partial diagnostics
- **THEN** producer MUST以`cancelled` seal并保存已有facts
- **AND** 不可捕获进程死亡 MUST保持record open且不得伪造terminal outcome

### Requirement: Finish diagnostics transient cleanup 必须晚于 record retained
Formal Task Finish runner MUST只在execution record seal返回retained且正文完整性可确认后，删除精确invocation-owned diagnostics transient。seal、metadata post-read或diagnostics cleanup失败 MUST保持各自可诊断状态；seal失败 MUST保留diagnostics transient。Execution record lifecycle MUST NOT拥有、删除、延长或恢复Delivery Carrier、target lease、Delivery Adaptation、Environment resource或其他Finish recovery material。

#### Scenario: record retained 后 diagnostics cleanup成功
- **WHEN** Finish record已retained且transient summary identity匹配invocation
- **THEN** producer MUST只删除该invocation diagnostics目录并报告cleaned
- **AND** retained record、Finish current、Carrier与terminal facts MUST保持不变

#### Scenario: seal失败但 Finish owner facts已变化
- **WHEN**body publish或metadata seal无法证明retained，而Finish已形成delivery、cleanup或terminal owner facts
- **THEN** producer MUST保留diagnostics transient并报告attention
- **AND** MUST NOT回滚、改写或重放remote delivery、Task Environment cleanup、Carrier cleanup、Task terminal transition或`task_finish_current`

#### Scenario: blocked Finish保留恢复资源
- **WHEN** Finish invocation以blocked record retained，但同一Finish run仍需Carrier、resume token、lease或cleanup resource恢复
- **THEN** record producer MAY清理本invocation diagnostics transient
- **AND** Finish owner MUST继续按其current状态保留精确恢复资源，record retention MUST NOT代替或删除这些资源
