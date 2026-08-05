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
Task Verification Application MUST独占Result normalization、Task/Project resolution、declaration identity观察、persistence调用、Result digest与applicability派生。CLI、Skill、Local App、Development、Finish、Task Record与Task Environment MUST NOT直接读写Result store或复制其字段authority；Development MUST只消费Application inspect/declaration read model，Finish MUST不再消费Verification。

#### Scenario: CLI 记录 Result
- **WHEN** Agent调用`buildr task verification record <task-id>`
- **THEN** CLI MUST只解析输入并调用同一Application
- **AND** persistence writer与reader的静态调用方 MUST只有Task Verification Application/repository组合

#### Scenario: declaration 尚在 Task Environment
- **WHEN** 当前Content Target使用的Project declaration bytes尚未进入canonical Workspace
- **THEN** inspect/record MAY提供`--declaration-root`，但Application MUST只接受该Task当前matching ready Environment的精确根
- **AND** Result MUST只保存Workspace相对declaration path与content identity，不得保存declaration root

#### Scenario: Development检查Result
- **WHEN** Task Development准备冻结Candidate
- **THEN** Development MUST调用Task Verification Application inspect并提供current Content Target identity/declaration root
- **AND** MUST不直接读取YAML、计算Result digest或自行派生declaration applicability

#### Scenario: Local App 查看 Result
- **WHEN** 用户在Task详情查看Verification
- **THEN** Local App MUST调用同一Application的inspect read model
- **AND** 页面/API MUST NOT暴露direct Result writer

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
Application inspect MUST对Content Target与Task scope内全部Project declaration分别派生applicability，不得把applicability持久化。任一declaration出现、消失、内容、registry/path或validity变化 MUST使current Result stale；Content Target identity不同时 MUST stale；未提供当前target时target轴 MUST为unknown。

#### Scenario: target 与 declarations 均未变化
- **WHEN** inspect提供的Content Target identity等于Result target，且所有当前declaration observations与Result相等
- **THEN** overall applicability MUST为`current`

#### Scenario: Local App 没有当前 target identity
- **WHEN** Local App只读inspect且declarations仍current
- **THEN** overall applicability MUST为`unknown`
- **AND** Application MUST NOT从HEAD、Candidate、dirty tree、Environment或时间伪造target identity

#### Scenario: policy 内容变化
- **WHEN** 任一Project `verification.yml` bytes与Result中绑定的identity不同
- **THEN** overall applicability MUST为`stale`
- **AND** reader MUST返回可解释的declaration reason

### Requirement: Verification Execution 必须保持 transient
`buildr verification run` MUST 针对显式 Project、target identity 与 capability identities 执行 Project v2 中已有的 command invocation，并 MUST 把完整命令输出、真实 wall-clock、资源等待、执行上下文、Workspace Node、target stability 和诊断写入 `buildr.verification-execution/v1` transient summary。Runner MUST NOT 写 current Result。

#### Scenario: 显式命令能力执行完成
- **WHEN** 调用方选择一个或多个有效 command capabilities
- **THEN** runner MUST 有界执行并返回每项真实 passed/failed 事实与完整 transient output
- **AND** caller MUST 在形成完整 Task 结论后另行通过 Application record

#### Scenario: 选择 Agent invocation
- **WHEN** `verification run` 收到 `invocation.kind: agent` 的 capability
- **THEN** runner MUST 在启动任何命令前拒绝
- **AND** Skill MAY 按 bounded instructions 执行并最终通过同一 record Application 提炼事实

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
Application 层 terminal projection MUST 只在成功 Finish 与 immutable handoff 等价，且 handoff verification gate 的 Result digest、Content Target identity 与 Verification current slot 完全一致时，返回 `verified-at-delivery` 及原始 passed/not-passed 结论。该关联 MUST NOT 改写 Verification Result、applicability 或 declaration currentness。

#### Scenario: 交付目标已验证通过
- **WHEN** completed delivered Task 的 Verification Result、handoff gate、Candidate Content Target 与 Finish identities 完全一致
- **THEN** terminal projection MUST 表达“已随交付目标验证通过”
- **AND** MUST 保留原始能力事实、coverage gaps 与 conclusion 内容

#### Scenario: 交付目标未验证通过但风险已明确接受
- **WHEN** matching handoff 保存 not-passed Verification Result digest 与合法 proceed risk decision
- **THEN** terminal projection MUST 表达“已随交付目标验证未通过”及已保存风险事实
- **AND** MUST NOT 改写为 passed

#### Scenario: active declaration currentness
- **WHEN** Task 仍 active 且调用方提供 current target/declaration inputs
- **THEN** Verification Application MUST 保持既有 current/stale/unknown 派生行为
- **AND** terminal delivery association MUST 不参与 live applicability
