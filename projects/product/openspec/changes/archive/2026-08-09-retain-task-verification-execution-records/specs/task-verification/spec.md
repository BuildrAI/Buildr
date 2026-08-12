## MODIFIED Requirements

### Requirement: Verification Execution 必须保持 transient
`buildr verification run` MUST针对显式Project、target identity与capability identities执行Project v2中已有的command invocation，并把完整执行事实写入provider-owned transient summary。带合法`--environment <task-id> --workspace <canonical-workspace>`的正式Task execution MUST另外在producer启动前打开一条`task-verification/verification-execution` record，并在execution完成后通过Task Execution Record Application持久化受控正文；Task外runner MUST继续只使用transient evidence。Runner MUST NOT写current Result。`--declaration-root` MUST只由`task verification record`接收；run或inspect误用时MUST在启动任何capability、打开execution record或读取任何声明路径前返回syntax diagnostic。

#### Scenario: 显式命令能力执行完成
- **WHEN** 调用方选择一个或多个有效command capabilities且没有正式Task context
- **THEN** runner MUST有界执行并返回每项真实passed/failed事实与完整transient output
- **AND** MUST NOT创建Task execution record，caller MUST在形成完整Task结论后另行通过Application record

#### Scenario: 正式Task命令能力执行完成
- **WHEN** 调用方提供matching ready Task Environment与canonical Workspace并选择有效command capabilities
- **THEN** runner MUST在首次resource/process/target execution副作用前以run ID打开一条record并取得quota reservation
- **AND** execution完成后 MUST以terminal outcome seal受控正文，只有record retained后才能清理该run的transient evidence
- **AND** current Verification Result MUST保持不变，直到caller另行形成完整结论并调用Task Verification Application record

#### Scenario: declaration-root 误用于 execution
- **WHEN** 调用方把`--declaration-root`传给`buildr verification run`
- **THEN** runner MUST在启动capability前返回参数错误并指向`task verification record`
- **AND** MUST NOT启动测试、打开execution record、写current Result或产生capability side effect

#### Scenario: target 在执行期间发生内容漂移
- **WHEN** capability checks已完成但execution root的tracked diff、status或untracked content fingerprint与执行前不同
- **THEN** transient summary MUST返回`target.stable=false`并将整体status设为`failed`
- **AND** formal Task execution record MUST以`failed` seal并在diagnostics保存有限fingerprint与相对变化路径摘要
- **AND** summary MUST NOT把Candidate dirty status单独解释为drift，也 MUST NOT将本机绝对路径写入current Result或持久正文

#### Scenario: 失败后重试
- **WHEN** 同一Task与target再次运行相同verification scope
- **THEN** retry MUST生成新的run identity与独立execution record且不得覆盖旧failed attempt
- **AND** later passed attempt MUST NOT自动声明旧record已被Result采用或在没有owner处置事实时把旧resolution改为recovered

#### Scenario: execution 中断
- **WHEN** runner收到可捕获取消或signal并能有界收敛已启动process
- **THEN** runner MUST保存已有partial output并以`cancelled` seal record，且不得覆盖已有current Result
- **AND** 不可捕获进程死亡 MUST保持open record而不是伪造terminal outcome或执行cleanup

#### Scenario: 选择 Agent invocation
- **WHEN** `verification run`收到`invocation.kind: agent`的capability
- **THEN** runner MUST在启动任何命令或打开execution record前拒绝
- **AND** Skill MAY按bounded instructions执行并最终通过同一Task Verification Result Application提炼事实，但本Change MUST NOT伪造尚未登记的Agent execution record producer

## ADDED Requirements

### Requirement: 正式 Verification execution 必须先取得持久化容量
Formal Task command runner MUST在调用前语义校验完成后、任何producer execution启动前调用Task Execution Record Application open。quota backpressure、Task terminal或record identity冲突 MUST阻止resource waiter、process与target observation启动，并 MUST NOT以先执行后丢弃正文绕过固定reservation。

#### Scenario: Task owner quota不足
- **WHEN** 新record的固定reservation会超过Task/owner或Workspace quota
- **THEN** runner MUST返回空checks、portable backpressure diagnostic与唯一cleanup/resolution next action
- **AND** MUST NOT启动capability、创建transient run目录、写current Result或静默清理其他record

#### Scenario: 调用前请求无效
- **WHEN** Project、declaration、capability、authorization、execution root或Workspace Node在open前校验失败
- **THEN** runner MUST返回既有invalid request envelope且execution record为not-opened
- **AND** MUST NOT创建metadata、quota reservation、transient evidence或专业Result
