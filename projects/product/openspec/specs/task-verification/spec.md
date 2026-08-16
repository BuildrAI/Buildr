# task-verification Specification

## Purpose
定义 Buildr 如何通过可替换的任务验证能力解析项目政策、执行分层验证，并生成绑定候选身份、包含真实耗时且具备明确生命周期的结果证据。
## Requirements

### Requirement: Task Verification 必须维护一个 Task-scoped current Result
Buildr MUST 为每个正式Task在Workspace SQLite中提供至多一份`buildr.task-verification-result/v1` current Result。Result MUST只包含Task/stable Content Target、Project declaration identities、实际执行capability facts、coverage gaps、整体结论与完成时间，并MUST保持可移植值语义但不进入Git。Verification Result MUST NOT绑定或生成Task Candidate。

#### Scenario: 完整验证形成 current Result
- **WHEN** Agent已针对Development观察到的明确stable Content Target完成全部选择、执行和事实提炼
- **THEN** Application MUST写入该Task唯一current Result，且`target.identity` MUST等于Content Target identity
- **AND** Result MUST NOT包含Candidate/generation、stdout、stderr、临时目录、本机绝对路径、Environment Receipt、resultDigest或applicability

#### Scenario: 没有测试能力
- **WHEN** Task scope内某个目标没有可用声明或适用能力
- **THEN** Result MUST通过`coverageGaps`如实记录缺口
- **AND** Verification MUST NOT自动创建测试、脚本或capability declaration

#### Scenario: 旧 Verification YAML 存在
- **WHEN** `.buildr/tasks/<task-id>/verification.yml` 存在、损坏或与SQLite不同
- **THEN** Application MUST只读取SQLite current Result
- **AND** MUST NOT迁移、双写、删除或生成兼容YAML

### Requirement: Result 必须使用关闭且最小的数据模型
Result MUST绑定非空Content Target `target.identity`和可移植`target.summary`；Project模式的declarations MUST非空且每个declaration MUST绑定Project、相对path与当前content identity或`absent`；仅工作区模式 MAY保存空declarations，但 MUST同时保存空capabilities、唯一`scope: workspace` coverage gap与`not-passed`结论。每个实际capability MUST绑定Project、capability identity、`passed|failed` outcome与至少一个portable fact；结论MUST只使用`passed|not-passed`。

#### Scenario: 调用方提交 lifecycle authority 字段
- **WHEN** record输入或持久Result包含Candidate identity/generation、verification policy decision、assurance level、proceed、blocked decision、Task status、revision、history、CAS、execution path或raw output字段
- **THEN** Application MUST拒绝整个值
- **AND** 原current MUST保持不变

#### Scenario: 完整失败结论
- **WHEN** 已完成的能力执行产生失败事实且整体结论已经形成
- **THEN** Agent MAY记录`not-passed` current Result
- **AND** Result MUST NOT决定是否带风险继续推进

#### Scenario: 仅工作区缺少验证能力
- **WHEN** current Task的有效Project集合为空且没有适用workspace验证能力
- **THEN** Result MUST以空declarations、空capabilities、唯一workspace coverage gap与`not-passed`形成完整负向事实
- **AND** MUST不自动生成declaration、capability fact、passed结论或风险处置

### Requirement: Result 必须原子整值替换且失败时保留 current
Repository MUST 在写入前完成 closed-schema normalization 与 serialization round-trip，再以单一 SQLite transaction 精确替换 current row并在提交前重读验证。任何写入阶段失败 MUST rollback并返回精确 stage diagnostic，且 MUST 保留原 current value。

#### Scenario: 执行中断或完整结论尚未形成
- **WHEN** execution 被中断、超时、只完成部分能力或 Agent 尚未形成完整 Task 结论
- **THEN** caller MUST NOT 调用 record
- **AND** 已有 current MUST 保持不变

#### Scenario: mutation 后 post-read 失败
- **WHEN** 新值已写入 transaction 但 Repository 无法重读确认
- **THEN** Repository MUST rollback整个transaction
- **AND** 原 current Result及其他Task current records MUST保持不变

#### Scenario: rename 后 post-read 失败
- **WHEN**遗留filesystem rename/post-read fault path被调用或注入
- **THEN** SQLite repository MUST不执行该已清退stage且MUST不读取或写回旧YAML
- **AND** 原current Result与其他Task current records MUST保持不变

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

### Requirement: 执行可靠性实现只服务真实声明能力
Runner MUST 继续使用Environment allowed roots、进程 descendant 有界收敛、单次 transient cleanup 与被实际 capability claim 的资源协调，并 MUST按capability声明argv与当前受控执行环境运行。Project declaration execution MUST NOT 新建通用 runtime resolver、DAG、dependency、supersedes、scheduler 或资源平台语义。对同一 coordinated resource 的有效 waiter，coordinator MUST 按确定的先到顺序授予可用容量，并 MUST 让取消、timeout、崩溃或过期 waiter 可被精确、有界恢复；新 waiter MUST NOT 越过仍有效的更早 waiter。

#### Scenario: 真实 coordinated capability 并发
- **WHEN** 两个或更多 execution runs 声明并请求同一有限容量 coordinated resource
- **THEN** coordinator MUST 按有效等待顺序授予 slot、绑定 owner/token/expiry 并精确释放
- **AND** 新 waiter MUST NOT 在更早 waiter 仍有效且容量不足时先取得 slot
- **AND** ticket、lease 与等待事实 MUST 只存在于 transient execution evidence

#### Scenario: waiter 取消或过期
- **WHEN** 排队中的 waiter 被取消、达到 timeout、进程崩溃或其 ticket 已过期
- **THEN** coordinator MUST 只清理 token 与 owner 匹配或已可证明过期的 ticket
- **AND** 后续有效 waiter MUST 在有界时间内继续取得可用容量
- **AND** coordinator MUST NOT 删除其他 waiter 或 lease

#### Scenario: flat capability set
- **WHEN** 一个 execution 选择多个互不依赖的 capabilities
- **THEN** runner MAY 有界并发执行
- **AND** declaration 与 Result MUST 不包含 `dependsOn`、`supersedes` 或 DAG status

### Requirement: Verification 不得拥有 Task 推进或其他专业 authority
Task Verification MUST NOT创建Candidate/generation、更新Task顶层状态、决定verification policy或proceed/blocked、实现缺失测试、替代Task Review/Environment/业务验收，或发布metadata。Task Development MAY根据current Result做自己的fail-closed决定，但MUST NOT回写该决定为Verification字段；Task Finish MUST不读取或补齐Verification Result。

#### Scenario: Development消费not-passed Result
- **WHEN** Task Development读取到current且`not-passed`的Result
- **THEN** Development MAY在policy事实完整时冻结Candidate，但MUST在没有精确用户风险接受时阻止proceed/handoff并形成自己的blocked decision
- **AND** Verification Result MUST保持原事实，不得新增blocked/proceed、risk、Candidate或Finish stage

#### Scenario: Finish 消费 not-passed Result
- **WHEN** 旧Finish consumer尝试读取或解释`not-passed` Verification Result
- **THEN** P0.5 runtime MUST拒绝该authority路径并返回Task Development
- **AND** Finish MUST只消费current Development handoff，不得运行Verification或决定风险

### Requirement: terminal delivery association 必须证明交付目标使用了对应 Verification Result
Application 层 terminal projection MUST只读取matching Finish completion中保存的association；当handoff verification gate的Result digest、Content Target identity与Verification current slot完全一致时，才返回`verified-at-delivery`及原始passed/not-passed结论。该关联 MUST NOT改写Verification Result、保存时applicability或declaration facts，也MUST NOT依赖独立lifecycle projection。

#### Scenario: 交付目标已验证通过
- **WHEN** completed delivered Task的Verification Result、Finish completion association与Development handoff identities完全一致
- **THEN** terminal projection MUST表达“已随交付目标验证通过”
- **AND** MUST保留原始能力事实、coverage gaps与conclusion内容

#### Scenario: 交付目标未验证通过但风险已明确接受
- **WHEN** matching completion association保存not-passed Verification Result digest且handoff含合法proceed risk decision
- **THEN** terminal projection MUST表达“已随交付目标验证未通过”及已保存风险事实
- **AND** MUST NOT改写为passed

#### Scenario: active declaration currentness
- **WHEN** Task仍active且Overview同时读取Verification row与Development verification gate
- **THEN** Application MAY比较已保存target/result digest并报告matched/mismatched/unknown
- **AND** terminal delivery association MUST不参与live applicability，也不得触发外部观察

### Requirement: Verification current row 必须保存稳定查询字段
Task Verification repository MUST在同一current row保存Domain验证的完整`result_json`、同一Result的`target_identity`、`outcome`与`updated_at`。这些字段MUST只用于结果定位、Overview查询与保存值一致性检查，MUST NOT复制capability facts、coverage gaps、declarations、Development adoption或terminal association。

#### Scenario: 记录 Verification Result
- **WHEN** Application完成declaration observation并形成完整Result
- **THEN** repository MUST在单一transaction中原子替换JSON与查询字段并写后验证
- **AND** target/outcome/time与Result JSON不一致时 MUST rollback并保留原current

#### Scenario: 读取 Overview
- **WHEN** Task Overview查询Verification摘要
- **THEN** repository MUST返回row presence、target、outcome与updated time
- **AND** MUST NOT复制完整Result或重新解析Project declaration

### Requirement: Verification coverage gap必须触发Declaration Intake提示
Task Verification形成或读取coverage gap时 MUST提供只读Declaration Intake next action。Verification Result MUST继续只保存gap事实，且Task Verification MUST不在record或inspect中创建测试或写`verification.yml`。

#### Scenario: Project没有verification declaration
- **WHEN**完整Result记录`project:<code>` coverage gap
- **THEN**operation result MUST提示用户可启动Declaration Intake
- **AND** current Result MUST保持原gap，不因后续声明候选而改写

#### Scenario: 声明存在但Service coverage缺失
- **WHEN**完整Result记录`service:<project>/<service>` coverage gap
- **THEN**next action MUST携带该scope供Agent只读发现
- **AND**用户未授权时 MUST不更新Project声明

### Requirement: 正式 Verification execution 必须先取得持久化容量
Formal Task command runner MUST在调用前语义校验完成后、任何producer execution启动前调用Task Execution Record Application open。quota backpressure、Task terminal或record identity冲突 MUST阻止resource waiter、process与target observation启动，并 MUST NOT以先执行后丢弃正文绕过固定reservation。

#### Scenario: Task owner quota不足
- **WHEN** 新record的固定reservation会超过Task/owner或Workspace quota
- **THEN** runner MUST返回空checks、portable backpressure diagnostic与唯一cleanup/resolution next action
- **AND** MUST NOT启动capability、创建transient run目录、写current Result或静默清理其他record

#### Scenario: 调用前请求无效
- **WHEN** Project、declaration、capability、authorization或execution root在open前校验失败
- **THEN** runner MUST返回既有invalid request envelope且execution record为not-opened
- **AND** MUST NOT创建metadata、quota reservation、transient evidence或专业Result

### Requirement: Task Verification 必须为仅工作区Task记录类型化coverage gap
Task Verification MUST从Task Record的显式Project、Service所属Project与Change所属Project派生按code排序的有效Project集合，并观察该集合中的全部Project declarations。只有集合为空时，Application MUST允许Result保存空declarations；该Result MUST包含唯一`scope: workspace` coverage gap、空capabilities与`not-passed` conclusion。有效Project集合非空时，Application MUST要求非空且完整的Project declarations，并 MUST拒绝workspace gap。

#### Scenario: workspace-only Result不自动passed
- **WHEN** workspace-only Task没有已声明或适用的workspace验证能力
- **THEN** record MUST保存空Project declarations、唯一workspace coverage gap与`not-passed` conclusion
- **AND** MUST不自动创建测试、声明、capability fact或passed结论

#### Scenario: Project Task仍拒绝空declarations
- **WHEN** Task具有显式Project、Service所属Project或Change所属Project
- **THEN** declaration observer MUST返回每个有效Project的current declaration或absent observation
- **AND** Application/repository新写入 MUST拒绝空declarations和workspace coverage gap

#### Scenario: Service-only Task观察父Project
- **WHEN** Task只在`scope.services`引用一个或多个Service且未冗余填写`scope.projects`
- **THEN** Task Verification MUST观察每个Service所属Project的declaration并执行现有Service applicability检查
- **AND** MUST不把该Task分类为workspace-only

#### Scenario: 多Project与Project-bound Change完整观察
- **WHEN** 有效Project集合来自显式Project、多个Service或多个Change且存在重复Project
- **THEN** Application MUST去重排序并精确绑定全部Project declaration identities
- **AND**任一 declaration新增、删除或identity变化 MUST使旧Result declaration applicability stale

#### Scenario: workspace Result currentness
- **WHEN** caller提供的Content Target与保存值相同且current declaration observations仍为空
- **THEN** inspect MUST通过纯值比较返回target与declarations current
- **AND**Content Target变化或有效Project集合变为非空 MUST返回stale而不是修改、回填或删除旧Result

#### Scenario: workspace Result closed shape不完整
- **WHEN** 空declarations与缺失workspace gap、Project/Service gap、非空capabilities、overrides语义或passed conclusion组合
- **THEN** domain或Application MUST拒绝整个Result并保留原current值
- **AND** MUST返回稳定类型化diagnostic

### Requirement: Task Verification Application 必须是 Buildr Web 与专业 consumer 的唯一 writer 和 reader
Task Verification Application MUST独占Result normalization、Task/Project resolution、正式record action中的declaration identity观察、persistence调用、Result digest与保存值applicability派生。CLI、Skill、Buildr Web、Development、Finish、Task Record与Task Environment MUST NOT直接读写Result store或复制其字段authority；inspect MUST NOT接收declaration root或打开声明路径，Development MAY只提交已经由其正式action观察的declaration identity值做纯比较，Finish MUST不再消费Verification。

#### Scenario: CLI 记录 Result
- **WHEN** Agent调用`buildr task verification record <task-id>`
- **THEN** CLI MUST只解析输入并调用同一Application
- **AND** persistence writer与reader的静态调用方 MUST只有Task Verification Application/repository组合

#### Scenario: declaration 尚在 Task Environment
- **WHEN** 当前Content Target使用的Project declaration bytes尚未进入canonical Workspace
- **THEN** 只有record MAY提供`--declaration-root`，且Application MUST只接受该Task当前matching ready Environment的精确根
- **AND** inspect MUST拒绝该参数，Result MUST只保存Workspace相对declaration path与content identity

#### Scenario: Development检查Result
- **WHEN** Task Development准备冻结Candidate
- **THEN** Development MUST调用Task Verification Application inspect并提供current Content Target与已观察declaration identities
- **AND** MUST不提交declaration path、直接读取Result store或自行计算Result digest

#### Scenario: Buildr Web 查看 Result
- **WHEN** 用户在Task详情查看Verification
- **THEN** Buildr Web MUST调用同一Application的inspect read model且未提供axis为unknown
- **AND** 页面/API MUST NOT暴露direct Result writer或触发declaration observation

### Requirement: Buildr Web 展示的 Applicability 必须由 target 与 declaration identities 派生
Task Verification `record` MUST在正式action中观察并保存Content Target与Task有效Project集合内全部Project declaration identities，并返回该action时点的current applicability；仅工作区Task MUST观察并保存空declarations。后续`inspect` MUST只读取保存的Result/查询字段，并只对调用方显式提供的target/declaration identity值做纯值比较；MUST NOT接受路径作为读取时观察authority，不得读取Project registry、`verification.yml`、Git、Content Target或Environment来刷新applicability。未提供某axis的current identity值时，该axis MUST为unknown或明确表达最近一次record action的历史观察，MUST NOT声称live current。

#### Scenario: record 时 target 与 declarations 已确认
- **WHEN** Application在合法record action中观察的target与全部Project declarations被写入同一Result
- **THEN** operation result MUST返回该action observedAt下的current applicability
- **AND** Result与查询字段 MUST在同一transaction中保存

#### Scenario: target 与 declarations 均未变化
- **WHEN** caller提供Content Target与declaration identity值且分别等于Result保存值
- **THEN** inspect MUST通过纯值比较返回对应axis current
- **AND** MUST NOT打开caller path或重新读取declaration bytes

#### Scenario: Buildr Web 没有当前 target identity
- **WHEN** Buildr Web只读inspect但没有提供current target/declaration identity值
- **THEN** Application MUST返回已有Result、record observedAt与unknown/last-observed语义
- **AND** MUST NOT从HEAD、Candidate、dirty tree、Environment、Project文件或时间伪造live identity

#### Scenario: policy 内容变化
- **WHEN** caller显式提供的任一Project declaration identity与Result保存值不同
- **THEN** overall applicability MUST为`stale`并返回可解释的declaration reason
- **AND** reader MUST NOT打开`verification.yml`或从path自行观察变化

#### Scenario: 显式 identity 已变化
- **WHEN** caller提供的target或任一declaration identity与Result保存值不同
- **THEN** 对应axis与overall applicability MUST为stale并返回保存值差异reason
- **AND** MUST NOT删除、覆盖或改写current Result

#### Scenario: 仅工作区declarations保持空集合
- **WHEN** caller提供的target与保存值相同，且current Task有效Project集合与declaration observations仍为空
- **THEN** declarations axis MUST通过空数组纯值比较返回current
- **AND** Task新增Project、Service或Project-bound Change后 MUST以非空observations使旧Result返回stale

### Requirement: 正式 Verification 必须稳定识别 invocation 并阻止非显式重复启动
Buildr MUST 为每次合法 formal Task Verification request 在启动 capability 前生成portable closed `invocationIdentity`，该identity MUST只绑定Task、target、Project/declaration与规范化capability集合，并MUST不包含授权表达、并发度、run随机数、时间或本机路径。Task Execution Record Application MUST在同一原子transaction中exact查询相同Task、owner、kind与invocation identity的历史record；没有显式`--retry`时，既有active或terminal record MUST阻止第二份capability/process执行，并MUST按active优先、随后terminal的规则复用`opened_at DESC, record_id DESC`所选latest record。`--retry` MUST创建新的run identity与独立execution record，并MUST不覆盖、结束或采用既有record；identity输入变化 MUST创建新的首次执行而不要求`--retry`。

#### Scenario: 相同正式验证仍在执行
- **WHEN** 第二个`verification run`请求与一个或多个`open` record具有相同invocation identity且未提供`--retry`
- **THEN** runner MUST返回按`opened_at DESC, record_id DESC`确定性选出的latest active record/run identity与可查询next action
- **AND** MUST不创建record、取得resource、启动capability process、观察target或写current Verification Result

#### Scenario: 相同正式验证已有terminal结果
- **WHEN** 相同invocation identity不存在active record但存在`retained`、`cleanup_pending`、`cleaned`或`attention` record且未提供`--retry`
- **THEN** runner MUST返回按`opened_at DESC, record_id DESC`确定性选出的latest terminal record/run identity及其原outcome/lifecycle
- **AND** MUST返回零checks、零duration与`not-started-existing-terminal` timing，且不得创建record、取得resource、启动capability process、观察target、创建transient evidence或写current Verification Result

#### Scenario: terminal历史不阻止新执行
- **WHEN** 相同invocation identity已有terminal历史，但caller显式提供`--retry`，或任一invocation identity输入发生变化
- **THEN** terminal历史 MUST不阻止新run与独立record的首次打开和执行
- **AND** 没有显式`--retry`且identity未变化时 MUST复用terminal历史，不得把旧Scenario解释为默认重复执行授权

#### Scenario: terminal通过结果保持通过
- **WHEN** 默认复用的terminal record outcome为`passed`且lifecycle不是`attention`
- **THEN** execution envelope MUST返回`passed`并保留原record identity、outcome与lifecycle
- **AND** MUST不把该Execution Record readback保存为新的Verification Result

#### Scenario: terminal负向或attention结果不改写
- **WHEN** 默认复用的terminal record outcome为`failed`、`blocked`或`cancelled`，或lifecycle为`attention`
- **THEN** execution envelope MUST返回failed与非零退出并保留原outcome/lifecycle
- **AND** MUST提供inspect与显式retry next action，不得自动重跑或改写为passed

#### Scenario: active优先于terminal历史
- **WHEN** 相同invocation identity同时存在active与terminal records且未提供`--retry`
- **THEN** runner MUST只在active集合中选择latest record
- **AND** terminal历史与全部未选record MUST保持不变并继续可list/inspect

#### Scenario: 显式重试active invocation
- **WHEN** caller确认需要独立执行并显式提供`--retry`
- **THEN** runner MUST生成新run identity并打开独立record后执行请求，即使相同identity已有active或terminal record
- **AND** 新旧record MUST共享invocation identity但保留独立run/record identity，既有record的lifecycle、正文、resolution与owner facts MUST保持不变

#### Scenario: invocation identity输入变化
- **WHEN** Content Target、Project、verification declaration identity、规范化capability集合或其他既有invocation identity输入发生变化
- **THEN** runner MUST生成不同invocation identity并正常创建首次run/record
- **AND** caller MUST不需要提供`--retry`

#### Scenario: terminal状态集合保持closed
- **WHEN** Application判断Execution Record是否terminal
- **THEN** outcome集合 MUST为`passed|failed|blocked|cancelled`且lifecycle集合 MUST为`retained|cleanup_pending|cleaned|attention`
- **AND** `running|open` MUST只代表active，未来新增状态 MUST显式更新domain、query、contract与测试后才能参与复用

#### Scenario: 相同时间戳仍稳定选择
- **WHEN** 同一invocation的多个候选record具有相同`opened_at`
- **THEN** repository MUST使用`record_id DESC`作为确定性tie-breaker
- **AND** 重复查询 MUST返回同一record，不得依赖数据库未声明的行顺序

#### Scenario: session丢失后按Task恢复读取
- **WHEN** 原调用终端或工具session不可用但formal execution record已经open或terminal
- **THEN** Agent MUST能通过Task-scoped public list定位record并通过inspect读取current lifecycle或terminal摘要
- **AND** 恢复读取或默认重复调用 MUST不启动新的verification execution或写Verification Result
