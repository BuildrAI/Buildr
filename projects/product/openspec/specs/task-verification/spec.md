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
Result MUST绑定非空Content Target `target.identity`和可移植`target.summary`；每个declaration MUST绑定Project、相对path与当前content identity或`absent`；每个实际capability MUST绑定Project、capability identity、`passed|failed` outcome与至少一个portable fact；结论MUST只使用`passed|not-passed`。

#### Scenario: 调用方提交 lifecycle authority 字段
- **WHEN** record输入或持久Result包含Candidate identity/generation、verification policy decision、assurance level、proceed、blocked decision、Task status、revision、history、CAS、execution path或raw output字段
- **THEN** Application MUST拒绝整个值
- **AND** 原current MUST保持不变

#### Scenario: 完整失败结论
- **WHEN** 已完成的能力执行产生失败事实且整体结论已经形成
- **THEN** Agent MAY记录`not-passed` current Result
- **AND** Result MUST NOT决定是否带风险继续推进

### Requirement: Task Verification Application 必须是唯一 writer 和 reader
Task Verification Application MUST独占Result normalization、Task/Project resolution、正式record action中的declaration identity观察、persistence调用、Result digest与保存值applicability派生。CLI、Skill、Local App、Development、Finish、Task Record与Task Environment MUST NOT直接读写Result store或复制其字段authority；inspect MUST NOT接收declaration root或打开声明路径，Development MAY只提交已经由其正式action观察的declaration identity值做纯比较，Finish MUST不再消费Verification。

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

#### Scenario: Local App 查看 Result
- **WHEN** 用户在Task详情查看Verification
- **THEN** Local App MUST调用同一Application的inspect read model且未提供axis为unknown
- **AND** 页面/API MUST NOT暴露direct Result writer或触发declaration observation

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

### Requirement: Applicability 必须由 target 与 declaration identities 派生
Task Verification `record` MUST在正式action中观察并保存Content Target与Task scope内全部Project declaration identities，并返回该action时点的current applicability。后续`inspect` MUST只读取保存的Result/查询字段，并只对调用方显式提供的target/declaration identity值做纯值比较；MUST NOT接受路径作为读取时观察authority，不得读取Project registry、`verification.yml`、Git、Content Target或Environment来刷新applicability。未提供某axis的current identity值时，该axis MUST为unknown或明确表达最近一次record action的历史观察，MUST NOT声称live current。

#### Scenario: record 时 target 与 declarations 已确认
- **WHEN** Application在合法record action中观察的target与全部Project declarations被写入同一Result
- **THEN** operation result MUST返回该action observedAt下的current applicability
- **AND** Result与查询字段 MUST在同一transaction中保存

#### Scenario: target 与 declarations 均未变化
- **WHEN** caller提供Content Target与declaration identity值且分别等于Result保存值
- **THEN** inspect MUST通过纯值比较返回对应axis current
- **AND** MUST NOT打开caller path或重新读取declaration bytes

#### Scenario: Local App 没有当前 target identity
- **WHEN** Local App只读inspect但没有提供current target/declaration identity值
- **THEN** Application MUST返回已有Result、record observedAt与unknown/last-observed语义
- **AND** MUST NOT从HEAD、Candidate、dirty tree、Environment、Project文件或时间伪造live identity

#### Scenario: policy 内容变化
- **WHEN** caller显式提供的任一Project declaration identity与Result保存值不同
- **THEN** overall applicability MUST为`stale`并返回可解释的declaration reason
- **AND** reader MUST NOT打开`verification.yml`或从path自行观察变化

#### Scenario: 显式 identity 已变化
- **WHEN** caller提供的target或任一declaration identity与Result保存值不同
- **THEN**对应axis与overall applicability MUST为stale并返回保存值差异reason
- **AND** MUST NOT删除、覆盖或改写current Result

### Requirement: Verification Execution 必须保持 transient
`buildr verification run` MUST针对显式Project、target identity与capability identities执行Project v2中已有的command invocation，并把完整执行事实写入transient summary。Runner MUST NOT写current Result。`--declaration-root` MUST只由`task verification record`接收；run或inspect误用时MUST在启动任何capability或读取任何声明路径前返回syntax diagnostic。

#### Scenario: 显式命令能力执行完成
- **WHEN** 调用方选择一个或多个有效command capabilities
- **THEN** runner MUST有界执行并返回每项真实passed/failed事实与完整transient output
- **AND** caller MUST在形成完整Task结论后另行通过Application record

#### Scenario: declaration-root 误用于 execution
- **WHEN** 调用方把`--declaration-root`传给`buildr verification run`
- **THEN** runner MUST在启动capability前返回参数错误并指向`task verification record`
- **AND** MUST NOT启动测试、写current Result或产生capability side effect

#### Scenario: target 在执行期间发生内容漂移
- **WHEN** capability checks已完成但execution root的tracked diff、status或untracked content fingerprint与执行前不同
- **THEN** transient summary MUST返回`target.stable=false`并将整体status设为`failed`
- **AND** summary MUST提供相对于target root的有限变化分类或路径摘要，以区分target drift与capability assertion failure
- **AND** summary MUST NOT把Candidate dirty status单独解释为drift，也 MUST NOT将本机绝对路径写入current Result

#### Scenario: 选择 Agent invocation
- **WHEN** `verification run`收到`invocation.kind: agent`的capability
- **THEN** runner MUST在启动任何命令前拒绝
- **AND** Skill MAY按bounded instructions执行并最终通过同一record Application提炼事实

### Requirement: 执行可靠性实现只服务真实声明能力
Runner MUST 继续使用受管 Workspace Node、Environment allowed roots、进程 descendant 有界收敛、单次 transient cleanup 与被实际 capability claim 的资源协调。Project declaration execution MUST NOT 新建通用 DAG、dependency、supersedes、scheduler 或资源平台语义。对同一 coordinated resource 的有效 waiter，coordinator MUST 按确定的先到顺序授予可用容量，并 MUST 让取消、timeout、崩溃或过期 waiter 可被精确、有界恢复；新 waiter MUST NOT 越过仍有效的更早 waiter。

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
