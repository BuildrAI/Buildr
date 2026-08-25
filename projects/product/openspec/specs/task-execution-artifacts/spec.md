# task-execution-artifacts Specification

## Purpose

定义正式 Task execution record 的单一 Application authority、受限正文 Store、固定容量/backpressure 和 retention/cleanup 状态边界。

## Requirements

### Requirement: Task execution record 必须由单一 Application 管理
Buildr MUST提供唯一 Task Execution Record Application，为正式Task管理closed execution record metadata、正文生命周期、固定quota reservation、resolution与cleanup状态。v1 owner/kind MUST只接受`task-verification/verification-execution`与`task-finish/finish-diagnostics`；Application MUST拒绝任意owner、kind、event、tag、history payload、Consumer/Adoption关系或execution resource mutation。

#### Scenario: 幂等打开正式Task record
- **WHEN** registered producer以相同Task、owner、kind与run identity重复open execution record
- **THEN**Application MUST返回同一open record及其reservation，而不新增第二row或第二staging root
- **AND**target或producer identity不一致时 MUST fail closed并保留原record

#### Scenario: 未登记producer或不存在Task
- **WHEN**caller提交未登记owner/kind、任意payload或不存在的Task ID
- **THEN**Application MUST拒绝整个mutation
- **AND**MUST NOT创建metadata、body、quota reservation或专业Result

### Requirement: execution record 正文必须在写入前受限处理
Buildr MUST只把正文写入canonical Workspace的`.buildr/local/task-execution-records/<owner>/<record-id>/`，并 MUST在任何persistent write前应用版本化redaction、closed file-name与path/symlink/regular-file检查。SQLite MUST只保存Workspace-relative locator、digest、stored/original size、truncated与redaction version，MUST NOT保存stdout/stderr、完整diagnostics、环境变量、stdin、凭证或未经授权的绝对路径。

#### Scenario: 正文正常seal
- **WHEN**producer为open record提交closed UTF-8或JSON body files并以terminal outcome seal
- **THEN**writer MUST在owned staging中先脱敏和有界写入、fsync并原子rename，再提交retained metadata
- **AND**metadata MUST保存可重读的relative locator、aggregate digest/size、truncation与redaction version

#### Scenario: secret和本机路径进入正文
- **WHEN**body包含Bearer token、private key、credential/secret字段或未经授权的本机绝对路径
- **THEN**writer MUST在staging write前替换敏感内容并只持久化redacted bytes
- **AND**任何raw副本、env、stdin或原始命令参数 MUST NOT落盘

#### Scenario: publish后metadata失败
- **WHEN**final body directory已原子rename但SQLite seal transaction失败
- **THEN**Application MUST不把record报告为retained，并 MUST保留可识别manifest/attention现场供精确恢复
- **AND**重试 MUST只复用identity与digest匹配的owned directory，不得覆盖或删除未知内容

### Requirement: execution record 容量必须固定且在execution前backpressure
Buildr MUST固定单文件4 MiB、单record16 MiB、同一Task/owner 256 MiB与Workspace 2 GiB上限。Application MUST在open transaction中按16 MiB record boundary预留容量；open按reservation计费，seal后按stored bytes计费，cleaned后释放。caller MUST NOT覆盖容量或先执行producer再丢弃正文。

#### Scenario: 文件或record超过上限
- **WHEN**redacted body file超过4 MiB或record total超过16 MiB
- **THEN**writer MUST在UTF-8或valid structured boundary安全截断并保存original/stored bytes与`truncated: true`
- **AND**MUST NOT通过未登记文件或raw旁路绕过上限

#### Scenario: Task-owner或Workspace容量不足
- **WHEN**新的16 MiB reservation将超过256 MiB Task-owner或2 GiB Workspace上限
- **THEN**Application MUST在producer execution启动前返回backpressure和唯一cleanup/resolution next action
- **AND**MUST NOT创建record、staging directory或静默清理未解决/可恢复内容

### Requirement: execution record retention 与单记录cleanup 必须可恢复
Buildr MUST对passed正文至少保留7天且保留相同Task/owner/kind最近3次，对failed、blocked、cancelled正文至少保留30天并要求resolution为acknowledged或recovered。open、attention或仍不可证明terminal的record MUST NOT cleanup。eligible cleanup MUST先形成cleanup_pending CAS，再删除精确owned body，最后保存cleaned tombstone并保留digest/size/producer/cleanup code。

#### Scenario: passed record仍受时间或最近次数保护
- **WHEN**passed record未满7天或仍属于相同Task/owner/kind最近3次
- **THEN**Application MUST拒绝cleanup并返回具体retention原因
- **AND**record body与metadata MUST保持不变

#### Scenario: failed record尚未解决
- **WHEN**failed、blocked或cancelled record已满30天但resolution仍是pending
- **THEN**Application MUST拒绝cleanup并保持正文
- **AND**MUST NOT用时间到期代替acknowledged或recovered事实

#### Scenario: eligible record完成cleanup
- **WHEN**age、recent-count、resolution与ownership条件全部满足
- **THEN**Application MUST只删除该record directory并将metadata写为cleaned、locator清空、quota released
- **AND**digest、stored/original size、truncated、producer与cleanup code MUST作为tombstone保留

### Requirement: Verification producer 必须映射为 closed execution record
Registered Verification command runner MUST把一次formal Task invocation映射为一条`task-verification/verification-execution` record：`run_identity` MUST使用执行前生成的run ID，`target_identity` MUST使用请求的stable Content Target identity，`producer` MUST使用稳定registered identity。执行后生成的`executionIdentity`、verification scope、checks与diagnostics MUST进入受控正文而不是新增SQLite列、任意JSON metadata或Consumer/Adoption关系。

#### Scenario: Verification record metadata映射
- **WHEN** formal Task runner已通过调用前校验并生成run ID
- **THEN** producer MUST以`taskId + task-verification + verification-execution + runId`幂等open record并绑定请求target identity
- **AND** retry MUST使用新的run ID，执行后digest MUST NOT替代open时run identity

#### Scenario: Task外runner执行
- **WHEN** command runner没有合法formal Task Environment context
- **THEN** producer MUST NOT打开Task execution record
- **AND**既有transient evidence lifecycle MUST保持唯一runner evidence authority

### Requirement: Verification record正文必须使用closed body dictionary
Verification producer MUST只提交现有closed正文文件名。`summary.json` MUST保存versioned portable run/scope/execution identity、Project/declaration、selected capability/authorization IDs、安全runtime identity、check/timing与execution outcome；`timeline.json` MUST只保存closed execution milestones；`diagnostics.json` MUST只保存失败、resource coordination、interruption与target drift的有界诊断；stdout/stderr MUST按capability边界进入对应text文件。Producer MUST在persistent write前移除transient locator、本机root/executable、resource token、env、stdin与raw敏感argv，并 MUST继续由正文Store执行最终redaction和截断。

#### Scenario: passed execution seal
- **WHEN**全部checks通过、target稳定且runner形成完整正文
- **THEN** producer MUST提交`summary.json`、适用输出与timeline并以`passed` seal
- **AND** SQLite MUST只保存正文locator/digest/size/truncation与既有governance metadata

#### Scenario: failed或drift execution seal
- **WHEN** capability失败、timeout或target drift且已有完整terminal诊断
- **THEN** producer MUST以`failed` seal并提交`diagnostics.json`及已有partial output
- **AND** diagnostics MUST只包含portable code、exit/signal、resource ID/status、fingerprint与相对变化路径

#### Scenario: catchable cancellation
- **WHEN**runner有界处理显式取消或signal
- **THEN** producer MUST以`cancelled` seal并保存已有partial facts
- **AND** failure-class retention与pending resolution MUST由既有execution record Domain建立

### Requirement: Verification transient cleanup 必须晚于record seal
Formal Task runner MUST只在execution record seal已返回retained且正文完整性可确认后，调用existing Verification cleanup删除精确provider-owned transient run。seal、metadata post-read或cleanup失败 MUST返回各自可诊断状态；seal失败 MUST保留transient evidence，cleanup失败 MUST保留已retained record且不得回滚其事实。

#### Scenario: record retained后cleanup成功
- **WHEN** formal execution record已retained且transient summary identity匹配
- **THEN** runner MUST只删除该run目录并报告transient cleanup成功
- **AND** retained正文与metadata MUST保持不变

#### Scenario: seal失败
- **WHEN**body publish或metadata seal无法证明retained
- **THEN**runner MUST保留transient run并把formal execution报告为failed或attention
- **AND** MUST NOT写current Verification Result、删除未知目录或声称execution evidence已安全保留

### Requirement: Finish producer 必须把每次 invocation 映射为独立 closed execution record
Registered Task Finish runner MUST为每次真正开始的invocation尽力映射一条`task-finish/finish-diagnostics` record。`run_identity` MUST使用独立Finish invocation identity，`target_identity` MUST使用current Content Target identity，`producer` MUST使用稳定registered identity；逻辑run、Candidate/handoff、target与delivery facts MUST进入受控正文。record open、reservation或seal失败 MUST形成portable `attention`，但 MUST NOT阻止已授权的自动交付或delivery reconciliation，也 MUST NOT成为第二个Task/delivery terminal authority。

#### Scenario: 首次 Finish invocation metadata 映射
- **WHEN** producer能够为合法Finish invocation预留容量并打开record
- **THEN** producer MUST幂等绑定Task、owner、kind、invocation和Content Target identity
- **AND** 后续diagnostics MUST按closed body与retention规则处理

#### Scenario: record 容量不足
- **WHEN** 新reservation将超过Task-owner或Workspace容量
- **THEN** Finish producer MUST报告diagnostics attention并继续执行仍满足安全边界的交付或收敛
- **AND** MUST NOT创建未受控正文、伪造retained record或阻止远端事实登记

#### Scenario: 同一 Finish run 恢复
- **WHEN** blocked或cleanup-pending自动Finish run再次执行
- **THEN** producer SHOULD为新invocation尝试独立record并在正文引用原run和ordinal
- **AND** record失败 MUST NOT使原run、delivery evidence或Environment cleanup失效

#### Scenario: invalid或no-op Finish invocation
- **WHEN** request参数、Task/handoff或目标不合法，或既有delivery已经幂等成立
- **THEN** producer MUST NOT要求创建record才能返回诊断或no-op结果
- **AND** execution record MUST NOT改变既有delivery、Task、target或maintenance facts

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

### Requirement: Task Execution Record 必须提供同 authority 的 portable 只读视图
Task Execution Record Application MUST 按 Task 提供列表与单条详情的 portable read model，并 MUST 支持 `all`、`verification`、`finish` 三种 closed view；专业 view MUST 只映射既有 owner，所有 view MUST 读取同一 `task_execution_records` authority。Read model MUST NOT 暴露 SQLite、body locator、本机绝对路径、reserved quota、effects path，也 MUST NOT复制 Verification Result、Finish current/terminal 或 execution resource facts。

#### Scenario: 查看全部记录
- **WHEN** caller 请求一个 Task 的 `all` execution record view
- **THEN** Application MUST 按稳定顺序返回该 Task 的 Verification 与 Finish records
- **AND** 每条记录 MUST 使用同一 portable identity 与安全 metadata 投影

#### Scenario: 查看专业记录
- **WHEN** caller 请求 `verification` 或 `finish` view
- **THEN** Application MUST 分别只返回 `task-verification` 或 `task-finish` owner 的 records
- **AND** MUST NOT 创建或读取第二分类 store

#### Scenario: 读取其他 Task 的 record
- **WHEN** caller 以 Task A 的 route 请求实际属于 Task B 的 record identity
- **THEN** Application MUST fail closed
- **AND** MUST NOT 返回 Task B 的 metadata 或正文信息

### Requirement: Task Execution Record 正文必须通过白名单限量读取
Task Execution Record Application MUST 只接受 Task ID、record identity 与 manifest 中存在的 closed filename 读取正文。Body Store MUST 从 record 派生 owned directory，验证目录、manifest、record identity、owner、redaction version、文件集合、digest、size 与 SQLite metadata 后，返回最多 512 KiB 的 UTF-8 preview。响应 MUST 标明文件 digest、stored size、stored truncation 与 response truncation；MUST NOT 接受 path、locator、glob、range 或任意 filename。

#### Scenario: 读取有效正文文件
- **WHEN** retained record 的 requested filename 属于正文白名单且存在于已验证 manifest
- **THEN** Application MUST 返回 integrity-verified 的限量 UTF-8 内容及 portable file metadata
- **AND** 超过响应上限时 MUST 在 UTF-8 边界截断并标记 `responseTruncated`

#### Scenario: 文件名未声明
- **WHEN** requested filename 不在 closed 白名单或不在该 record manifest
- **THEN** Application MUST 在读取任意请求路径前拒绝
- **AND** MUST NOT 回退到目录扫描、路径拼接或 locator 输入

#### Scenario: cleaned tombstone
- **WHEN** record 已 cleaned 或正文状态不是 available
- **THEN** 列表与详情 MUST 继续返回 tombstone metadata
- **AND** 正文读取 MUST 返回稳定 unavailable diagnostic，不扫描文件系统恢复内容

#### Scenario: 正文完整性不匹配
- **WHEN** manifest、entry、digest、size 或 metadata 任一校验失败
- **THEN** body read MUST fail closed 且不返回部分正文
- **AND** MUST 保留现场供 owner recovery 或 Doctor 后续诊断

### Requirement: ExecRecord GC 必须按既有 authority 执行 bounded Workspace 回收
Task Execution Record Application MUST 提供 Workspace 级 ExecRecord GC，接受 closed `dryRun` 与 `limit`，并 MUST 只从 `task_execution_records` 选择候选。一次运行 MUST 有固定默认与最大 batch，MUST 优先恢复 `cleanup_pending`，再复用既有 retention、resolution、recent-count 与单记录 cleanup 处理 eligible retained 正文；MUST NOT 扫描文件系统、建立第二 GC store、自动处置 failure resolution、猜测 open record 已死亡或管理 execution resources。

#### Scenario: dry-run 计算候选
- **WHEN** caller 对 Workspace 执行 dry-run GC
- **THEN** Application MUST 按真实 current rows 和固定规则返回 bounded 候选与 action 摘要
- **AND** MUST NOT改变 record lifecycle、删除正文或删除 metadata

#### Scenario: bounded batch 清理 eligible 正文
- **WHEN** Workspace 同时存在多条 eligible retained 或 cleanup_pending records 且数量超过 limit
- **THEN** GC MUST 按稳定顺序最多处理 limit 条，并对正文 cleanup 复用单记录 CAS 与 owner-bound deletion
- **AND** 未选择记录 MUST 保持不变，单条失败 MUST NOT回滚或阻塞其他已选择记录

#### Scenario: 不可自动清理的 record
- **WHEN** record 仍为 open/attention、retention 未到期、recent-count 受保护，或 failure resolution 仍 pending
- **THEN** GC MUST 不选择该 record 执行 mutation
- **AND** MUST NOT通过时间、目录状态或调用方 override 改变其 disposition

### Requirement: ExecRecord GC 必须有限期保留 cleaned tombstone
ExecRecord GC MUST 对 cleaned metadata 应用固定 tombstone retention：`cleanedAt` 未满 90 天或仍属于同一 Task/owner/kind 最近 20 条 cleaned records 时 MUST 保留；两项保护均失效后 MAY 通过 expected-current 条件删除该 row。Tombstone purge MUST NOT删除或改写 Task、Verification Result、Finish current/terminal 或其他专业事实。

#### Scenario: tombstone 仍受时间保护
- **WHEN** cleaned record 距 `cleanedAt` 未满 90 天
- **THEN** GC MUST保留其 metadata
- **AND** MUST将它排除在本次 purge mutation 外

#### Scenario: tombstone 仍受最近次数保护
- **WHEN** cleaned record 已满 90 天但仍属于同一 Task/owner/kind 最近 20 条 cleaned records
- **THEN** GC MUST保留其 metadata
- **AND** MUST NOT因 Workspace 积压或 quota 状态删除它

#### Scenario: tombstone 到期删除
- **WHEN** cleaned record 已满 90 天且不再属于最近 20 条，且 mutation 时 current row 仍与已选择事实一致
- **THEN** GC MUST只删除该 `task_execution_records` row
- **AND** 并发变化时 MUST返回 skipped/conflict 而不是删除不同 current state

### Requirement: ExecRecord GC 结果必须 portable 且有界
ExecRecord GC MUST 返回 stable operation result，至少包含 mode、limit、扫描/选择/cleaned/purged/skipped/failed counts、每个已选择 record 的 identity、action、status 与 portable diagnostic。结果 MUST bounded by batch limit，MUST NOT包含 SQLite path、body locator、本机绝对路径、正文、secret 或任意 cleanup shell。

#### Scenario: 部分失败结果
- **WHEN** batch 中一条 record cleanup 失败而其他 records 成功
- **THEN** 顶层结果 MUST表达 partial 状态并分别列出成功与失败 action
- **AND** MUST不返回失败 record 的正文 locator 或底层数据库路径

### Requirement: Verification execution record 必须保存closed invocation identity
Task Execution Record Application MUST允许registered Verification producer为record提交一个portable `invocationIdentity`，并MUST把它作为现有record metadata的closed字段保存。Repository MUST在同一open transaction中按Task、owner、kind、invocation identity检查active record并返回`opened|existing-active`结果；该检查MUST不扫描正文、不读取transient evidence或建立第二张执行状态表。旧record MAY没有该字段且MUST继续可读，但MUST不参与新invocation的active duplicate匹配。

#### Scenario: 原子打开唯一active invocation
- **WHEN** 两个默认formal Verification请求并发提交相同invocation identity
- **THEN** Application MUST只创建一条新record与一份reservation
- **AND** 另一个请求 MUST取得`existing-active`结果且不能认领producer execution ownership

#### Scenario: invocation identity 不同
- **WHEN** target、Project、declaration或capability集合任一不同
- **THEN** Application MUST把请求视为不同invocation并按正常quota规则打开独立record
- **AND** MUST不依赖调用顺序、stdout或本机路径区分请求

#### Scenario: 读取旧record
- **WHEN** migration前的record没有invocation identity
- **THEN** list与inspect MUST继续返回其既有portable metadata和正文状态
- **AND** Application MUST不补造identity或修改旧record

### Requirement: Agent CLI read model 必须从同一 execution record authority 投影compact事实
Task Execution Record Application MUST为公共CLI复用既有Task-scoped list/detail/body完整性能力，并MUST为Verification record从受控`summary.json`及适用`diagnostics.json`投影compact execution facts。投影MUST只包含record/run/invocation identity、lifecycle/outcome、target、Project/declaration、capability IDs、started/finished/duration、失败摘要与available body filenames；MUST不返回SQLite、locator、本机root/executable、resource token、raw argv或任意正文path。

#### Scenario: list active与terminal records
- **WHEN** Agent按Task请求`verification` view
- **THEN** Application MUST按稳定顺序返回open、attention、retained与cleanedrecords的portable metadata
- **AND** list MUST不读取正文或改变record lifecycle

#### Scenario: inspect retained Verification record
- **WHEN** Agent以matching Task与record ID请求inspect且closed正文完整
- **THEN** Application MUST返回portable record、compact execution summary与available body filenames
- **AND** summary/diagnostics读取 MUST复用既有manifest与digest完整性验证

#### Scenario: inspect open record
- **WHEN** matching record仍为open且尚无retained正文
- **THEN** inspect MUST返回open lifecycle、run/invocation/target identity与`summary: unavailable`
- **AND** MUST不把open解释为failed、自动seal或启动producer

### Requirement: Verification open Execution Record 必须支持受控恢复
Task Execution Record Application MUST 只为 registered Verification producer 的 open record 提供受控 recover。存在 provider-owned terminal summary 时，Application MUST 校验 Task/record/run/invocation/target identity、summary boundary、完成事实与推导 outcome，并在同一原 record 上复用既有 body publish、redaction、quota 与 compare-and-set seal；MUST NOT重跑 capability、创建替代 record或采用 Verification Result。

#### Scenario: Agent 用完整终态证据补 seal
- **WHEN** Agent 为 matching open Verification record 提供合法 transient summary，且全部 identity、checks、finished time 与 outcome 一致
- **THEN** Application MUST以已证明 outcome seal 原 record并清理精确 provider-owned transient
- **AND** MUST不再次执行 capability或创建新 execution identity

#### Scenario: 终态证据不完整或错配
- **WHEN** summary 缺失、越出 owned boundary、schema 无效、identity 错配、没有完成事实或 outcome 不能由 checks 与 target stability 推导
- **THEN** Application MUST返回 blocked 或 authorization-required 且保持原 record 为 open
- **AND** MUST不发布 body、改变 quota、启动 Verification 或清理输入路径

#### Scenario: 并发 producer 已完成 seal
- **WHEN** recover 的 CAS mutation 前原 producer已把同一 record seal 为相同终态
- **THEN** recover MUST幂等返回既有 terminal record
- **AND** 不同 outcome 或不同 current facts MUST fail closed且不得覆盖

### Requirement: 不可证明的 Verification 执行必须以显式授权接受 unknown
当 open Verification record 没有可验证 terminal summary 时，Application MUST要求明确的 `unknown outcome` 授权才能终结原 record。授权后的 record MUST保存 `outcome: unknown`、`lifecycleStatus: retained`、`resolutionStatus: acknowledged` 与受控 recovery body；MUST不把未知结果表示为 passed、failed、blocked或cancelled。

#### Scenario: Agent 无法证明终态且没有用户授权
- **WHEN** Agent 请求恢复 open record但没有合法 summary，也没有显式 unknown outcome 授权
- **THEN** Application MUST返回 authorization-required、精确 effects 与建议用户决定的问题
- **AND** record、body、quota 与 duplicate matching MUST保持不变

#### Scenario: 用户授权接受未知结果
- **WHEN** Agent 携带明确 unknown outcome 授权恢复 matching open Verification record
- **THEN** Application MUST用固定 recovery evidence 终结原 record并返回 attention
- **AND** 该操作 MUST不接收自由文本结论、任意文件、path、outcome 或 cleanup shell

#### Scenario: 未知终态不阻塞新 invocation
- **WHEN** 相同 invocation identity 只有已授权的 `unknown` terminal record
- **THEN** Repository MUST允许后续普通 Verification 打开新 run与新 record
- **AND** 原 unknown record MUST继续可 list/inspect，且不能作为新执行结果复用

#### Scenario: unknown retention
- **WHEN** acknowledged unknown record 到达失败类固定 retention 并满足既有 GC 条件
- **THEN** GC MUST按既有 body cleanup 与 tombstone 规则处理
- **AND** MUST不因 unknown 自动缩短 retention 或删除原 record

### Requirement: Formal Verification stdout 必须默认投影 Execution Record compact summary
Formal `verification run --json` MUST缺省返回 `buildr.long-running-operation-summary/v1`，并 MUST在显式 `--detail full` 时返回既有 canonical Verification execution payload。compact summary MUST从同一 Task Execution Record与 terminal execution facts投影 record/run/invocation/result identity、状态、selected capability阶段摘要、primary failure、transient cleanup与唯一 record inspect pointer；MUST不返回 evidence locator、本机 root/executable、完整 checks、diagnostics或 stdout/stderr。

#### Scenario: formal Verification terminal success
- **WHEN** runner已seal matching passed Execution Record并完成或尝试 transient cleanup
- **THEN** 默认 stdout MUST返回 terminal passed compact summary与该 record inspect pointer
- **AND** full execution payload MUST继续存在于受控 evidence/Execution Record正文并可显式读取

#### Scenario: matching active duplicate
- **WHEN** 相同 invocation identity已有 open Execution Record且调用方未显式 `--retry`
- **THEN** runner MUST返回 `terminal: false`、`status: running`、同一 record/run identity与 inspect pointer
- **AND** MUST不启动 capability、新建record或生成新的 transient evidence

#### Scenario:客户端断连后 producer 已完成
- **WHEN** 调用方未收到 terminal stdout，但 matching Execution Record 已retained
- **THEN** record inspect MUST返回真实 terminal outcome与 compact execution facts
- **AND** 后续普通 invocation MUST复用既有 terminal duplicate语义，不得因 stdout 缺失重复昂贵验证
