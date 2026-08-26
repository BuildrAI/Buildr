## ADDED Requirements

### Requirement: Open Verification record 必须提供有界 current progress snapshot
Task Execution Record Application MUST允许registered Verification producer在现有open record上保存一份closed、覆盖式current progress snapshot。更新 MUST绑定Task、record、run、invocation与producer identity，并 MUST只在record仍open时成立；Application MUST不创建事件历史、第二张执行状态表或增量正文。

#### Scenario: capability phase或heartbeat推进
- **WHEN** matching producer开始capability、改变phase或到达节流heartbeat
- **THEN** Application MUST覆盖保存capability、phase、status、observed/heartbeat时间、PID/PGID、完成计数与有界最后输出摘要
- **AND** snapshot MUST不包含cwd、env、raw argv、token、绝对路径或完整stdout/stderr

#### Scenario: Agent读取running record
- **WHEN** record仍open且producer已保存current progress
- **THEN** matching单条detail MUST返回同一record/run identity与标记为`current-machine`的有界`openLocalProgress`
- **AND** MUST明确该事实仅表示最后已观察阶段，不构成terminal outcome或retry授权

#### Scenario: producer非正常死亡
- **WHEN** producer在terminal seal前失联
- **THEN** open record MUST保留最后current progress供recovery判断停留阶段
- **AND** Application MUST继续要求现有terminal summary recover或明确unknown授权，不得从heartbeat超时推断failed

#### Scenario: record terminal seal
- **WHEN** producer以passed、failed、blocked或cancelled terminal seal同一record
- **THEN** Application MUST清除current progress并让closed body保存最终summary、timeline与diagnostics
- **AND** terminal read model MUST不把旧PID/PGID或heartbeat表示为仍在运行

#### Scenario: stale或foreign producer更新progress
- **WHEN** record已terminal或Task/record/run/invocation/producer任一identity不匹配
- **THEN** Application MUST零写入拒绝更新并保留当前record
- **AND** MUST不允许consumer借progress writer修改outcome、resolution、quota或body lifecycle

## MODIFIED Requirements

### Requirement: Task Execution Record 必须提供同 authority 的 portable 只读视图
Task Execution Record Application MUST 按 Task 提供列表与单条详情的 portable read model，并 MUST 支持 `all`、`verification`、`finish` 三种 closed view；专业 view MUST 只映射既有 owner，所有 view MUST 读取同一 `task_execution_records` authority。Read model MUST NOT 暴露 SQLite、body locator、本机绝对路径、reserved quota、effects path，也 MUST NOT复制 Verification Result、Finish current/terminal 或 terminal execution resource facts。只有matching open Verification record的单条detail MAY额外返回明确标记`scope: current-machine`的有界`openLocalProgress`；portable list、terminal record与closed body MUST不返回PID/PGID或其他本机运行态。

#### Scenario: 查看全部记录
- **WHEN** caller 请求一个 Task 的 `all` execution record view
- **THEN** Application MUST 按稳定顺序返回该 Task 的 Verification 与 Finish records
- **AND** 每条记录 MUST 使用同一 portable identity 与安全 metadata 投影，且list MUST不包含`openLocalProgress`

#### Scenario: 查看专业记录
- **WHEN** caller 请求 `verification` 或 `finish` view
- **THEN** Application MUST 分别只返回 `task-verification` 或 `task-finish` owner 的 records
- **AND** MUST NOT 创建或读取第二分类 store

#### Scenario: 读取其他 Task 的 record
- **WHEN** caller 以 Task A 的 route 请求实际属于 Task B 的 record identity
- **THEN** Application MUST fail closed
- **AND** MUST NOT 返回 Task B 的 metadata、progress 或正文信息

### Requirement: Agent CLI read model 必须从同一 execution record authority 投影compact事实
Task Execution Record Application MUST为公共CLI复用既有Task-scoped list/detail/body完整性能力，并MUST为Verification record从受控`summary.json`及适用`diagnostics.json`投影compact execution facts。terminal投影MUST只包含record/run/invocation identity、lifecycle/outcome、target、Project/declaration、capability IDs、started/finished/duration、失败摘要与available body filenames；MUST不返回SQLite、locator、本机root/executable、resource token、raw argv或任意正文path。matching open Verification record的inspect MAY从同一row返回有界`openLocalProgress`，并 MUST明确其current-machine、非terminal与不可移植语义。

#### Scenario: list active与terminal records
- **WHEN** Agent按Task请求`verification` view
- **THEN** Application MUST按稳定顺序返回open、attention、retained与cleanedrecords的portable metadata
- **AND** list MUST不读取正文、不返回`openLocalProgress`或改变record lifecycle

#### Scenario: inspect retained Verification record
- **WHEN** Agent以matching Task与record ID请求inspect且closed正文完整
- **THEN** Application MUST返回portable record、compact execution summary与available body filenames
- **AND** summary/diagnostics读取 MUST复用既有manifest与digest完整性验证，且MUST不返回旧running progress

#### Scenario: inspect open record
- **WHEN** matching record仍为open且尚无retained正文
- **THEN** inspect MUST返回open lifecycle、run/invocation/target identity与可选`openLocalProgress`，并保持`summary: unavailable`
- **AND** MUST不把progress解释为failed、自动seal、启动producer或授权retry
