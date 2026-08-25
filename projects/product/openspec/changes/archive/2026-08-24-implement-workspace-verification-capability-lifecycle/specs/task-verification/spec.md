## ADDED Requirements

### Requirement: Task Verification 必须形成 closed Verification Request
正式Task Verification MUST从current Candidate/Content Target、有效Project集合、current v3 declaration identities、changed paths、风险和显式验证决策形成内容寻址Request。Request MUST分别声明target `task-delivery|product-candidate|published-release`与scope `affected|full|release-only`，且 MUST NOT由capability名称猜测目标或范围。

#### Scenario: 普通Task请求affected
- **WHEN** current Candidate验证frozen Task Content且没有强制full事实
- **THEN** Request MUST使用`task-delivery`和`affected`
- **AND** MUST绑定current declarations与冻结changed paths

#### Scenario: Product Candidate请求full
- **WHEN** caller验证exact Product Artifact Candidate
- **THEN** Request MUST使用`product-candidate`和`full`
- **AND** MUST NOT把内部Task Candidate identity描述为制品Candidate

### Requirement: Task Verification 必须在执行前形成可解释 Plan
Application MUST从matching Request、v3 declarations与适用provider形成closed、内容寻址Verification Plan。Plan MUST记录selected capability/item、evidence、proves、execution unit、`direct|dependency|full` selection reason、trigger/parent、coverage gaps、full reason和provider identity；Plan preview MUST NOT作为execution evidence或Result。

#### Scenario: affected直接选择与依赖扩张
- **WHEN** changed path命中一个直接owner且可信依赖事实要求consumer证据
- **THEN** Plan MUST分别标记direct item与dependency item及其parent/reason
- **AND** MUST NOT把dependency冒充直接path owner

#### Scenario: 未知owner
- **WHEN** 非ignored输入无法解析可信owner或安全full边界
- **THEN** Plan MUST形成owner coverage gap或blocked diagnostic
- **AND** MUST NOT返回空选择的passed计划

#### Scenario: affected不能可信收窄
- **WHEN** capability没有affected入口或关键选择authority发生变化
- **THEN** Plan MUST选择其full入口或完整目标集合并记录稳定full reason
- **AND** MUST NOT静默跳过或按文件名猜测测试

### Requirement: Execution Record 与 Result 必须对账 matching Plan
正式execution MUST在首个副作用前把request/plan identity、selected execution unit与declaration identity写入Task Execution Record；reconciliation MUST只消费matching terminal records并按既有唯一Application写current Result。Result MUST提炼实际capability facts、portable evidence identities、coverage gaps与结论，不得复制完整Plan、stdout/stderr或provider内部DAG。

#### Scenario: record与plan不匹配
- **WHEN** terminal record的plan、request、declaration或execution unit identity与current Plan不同
- **THEN** reconciliation MUST拒绝采用该record并保留原current Result
- **AND** MUST返回精确stale/mismatch diagnostic

#### Scenario: matching执行完成
- **WHEN** current Plan的required execution units均有matching terminal records
- **THEN** reconciliation MUST从记录提炼passed/failed facts和coverage gaps
- **AND** Result MUST保持Task推进、风险接受与Finish authority之外

## MODIFIED Requirements

### Requirement: Verification Execution 必须保持 transient
`buildr verification run` MUST针对显式Project、target identity与Plan selected execution units执行v3 declaration中的command或provider-resolved invocation，并把完整执行事实写入provider-owned transient summary。带合法`--environment <task-id> --workspace <canonical-workspace>`的正式Task execution MUST在producer启动前打开Task Execution Record并绑定request/plan；Task外runner MUST继续只使用transient evidence。Runner MUST NOT写current Result。

#### Scenario: 显式命令能力执行完成
- **WHEN** 调用方提交包含一个或多个command execution units的有效Request/Plan且没有正式Task context
- **THEN** runner MUST有界执行并返回每项真实passed/failed事实与完整transient output
- **AND** MUST NOT创建Task execution record，caller MUST在形成完整Task结论后另行通过Application reconciliation

#### Scenario: 正式Task命令能力执行完成
- **WHEN** 调用方提供matching ready Task Environment、canonical Workspace与包含command execution units的current Plan
- **THEN** runner MUST在首次resource/process/target execution副作用前以run ID打开绑定request/plan的record并取得quota reservation
- **AND** execution完成后 MUST以terminal outcome seal受控正文，只有record retained后才能清理该run的transient evidence
- **AND** current Verification Result MUST保持不变，直到caller另行形成完整结论并调用Task Verification Application reconciliation

#### Scenario: 显式Plan执行完成
- **WHEN** 调用方提交有效Request/Plan且没有正式Task context
- **THEN** runner MUST有界执行并返回每项真实passed/failed事实与完整transient output
- **AND** MUST NOT创建Task execution record或current Result

#### Scenario: 正式Task Plan执行完成
- **WHEN** 调用方提供matching ready Task Environment、canonical Workspace与current Plan
- **THEN** runner MUST在首次resource/process/target副作用前打开绑定request/plan的record
- **AND** execution完成后 MUST以terminal outcome seal受控正文，current Result保持不变直到独立reconciliation

#### Scenario: declaration-root 误用于 execution
- **WHEN** 调用方把`--declaration-root`传给`buildr verification run`
- **THEN** runner MUST在读取Plan或启动execution unit前返回参数错误并指向正式reconciliation入口
- **AND** MUST NOT启动测试、打开execution record、写current Result或产生capability side effect

#### Scenario: target 在执行期间发生内容漂移
- **WHEN** execution units完成但execution root fingerprint与执行前不同
- **THEN** transient summary MUST返回target unstable并失败
- **AND** formal record MUST以failed seal且不得把绝对路径写入Result

#### Scenario: 失败后重试
- **WHEN** 同一Task与target再次运行相同current Plan
- **THEN** retry MUST生成新的run identity与独立execution record且不得覆盖旧failed attempt
- **AND** later passed attempt MUST NOT自动声明旧record已被Result采用或在没有owner处置事实时把旧resolution改为recovered

#### Scenario: execution 中断
- **WHEN** runner收到可捕获取消或signal并能有界收敛已启动process/provider execution
- **THEN** runner MUST保存已有partial output并以cancelled seal record，且不得覆盖已有current Result
- **AND** 不可捕获进程死亡 MUST保持open record而不是伪造terminal outcome或执行cleanup

#### Scenario: 选择 Agent invocation
- **WHEN** Plan包含bounded agent invocation
- **THEN** command runner MUST在启动任何命令前拒绝自动执行
- **AND** Agent producer只有在能形成同一closed execution authority时才能提交事实
