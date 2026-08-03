## REMOVED Requirements

### Requirement: 任务验证能力独立于任务环境生命周期
**Reason**: v2 requirement 仍以候选 assurance provider 为中心，整体由 v3 Result authority 替换。
**Migration**: 使用“Task Verification 必须维护一个 Task-scoped current Result”。

### Requirement: 验证政策由当前 workspace 或 Project 定义
**Reason**: legacy/augment/authoritative 多来源政策会产生双 schema。
**Migration**: 只读取 Project `buildr.project-verification/v2`；缺失能力写入 coverage gap。

### Requirement: 实现验证采用三级反馈协议
**Reason**: `minimal/affected/candidate` 是旧 Finish lifecycle 分层，不是首版 Project capability policy。
**Migration**: Skill 按当前目标选择显式适用能力，Project 只声明 `requiredForDelivery`。

### Requirement: 验证证据绑定候选身份并随内容变化失效
**Reason**: P0.4 不创建 Candidate identity。
**Migration**: current Result 绑定 opaque target identity 与 declaration identities。

### Requirement: 验证能力测量真实 wall-clock 耗时
**Reason**: 耗时属于 transient Execution Evidence，不属于 portable Result contract。
**Migration**: execution summary 保留真实 wall-clock；Result 只保留可移植事实。

### Requirement: 验证能力返回并报告标准结果证据
**Reason**: v2 混合 execution summary 与 current Result。
**Migration**: 分别使用 `buildr.verification-execution/v1` 与 `buildr.task-verification-result/v1`。

### Requirement: Provider operation 与验证执行分离计数
**Reason**: execute call counter、Candidate executor counter 是旧 Finish 优化协议。
**Migration**: Finish 只报告是否复用或执行 current Result consumer path。

### Requirement: 验证在完成节点自动触发
**Reason**: 自动触发和推进状态属于未来 Task Development/consumer policy。
**Migration**: Skill、用户或临时 Finish consumer 显式请求 Verification。

### Requirement: 落盘验证证据具有显式生命周期
**Reason**: 旧 requirement 把 transient evidence 当作唯一落盘结果。
**Migration**: transient execution 继续显式 cleanup，current Result 由 Task store 持久保存。

### Requirement: Candidate evidence 与验证结果元数据 transition 分离
**Reason**: checkbox transition 与 Candidate reuse 属于旧 Finish lifecycle authority。
**Migration**: 删除该优化；target 或 declaration identity 变化后 Result 直接 stale。

### Requirement: Task environment 验证证据必须绑定实际执行上下文
**Reason**: Environment 执行绑定仍需保留，但不再进入 portable Result identity schema。
**Migration**: execution summary 校验 Environment；Result 只保存 target/declaration identity 与事实。

### Requirement: 多仓验证必须按 Project policy 和 repository ownership 组合
**Reason**: v2 将多仓 Candidate set 与 assurance 聚合固化为 provider schema。
**Migration**: Task scope 内每个 Project declaration 分别绑定；Skill 聚合实际能力与 coverage gaps。

### Requirement: 验证必须精确披露非 Git 隔离状态
**Reason**: Git/非 Git checkout 形态属于 transient execution context，不是 Result 字段。
**Migration**: execution summary 如实记录，portable Result 使用调用方提供的 target identity。

### Requirement: Task verification 必须表达前序 evidence 的失效原因与替代关系
**Reason**: 首版不建设 history、supersedes 或 persistent revision。
**Migration**: current slot 整值替换；reader 只派生 current/stale/unknown。

### Requirement: Verification policy 必须识别 archive-sensitive coverage 信号
**Reason**: 特定风险层级不应固化在通用 Result authority。
**Migration**: Project v2 capability 通过 applicability paths/conditions 声明。

### Requirement: Verification provider 必须聚合 required capabilities
**Reason**: v2 required assurance 聚合被 `requiredForDelivery` 和 consumer 选择替代。
**Migration**: Skill 选择适用能力；Finish 只消费适用且 delivery-required 的能力。

### Requirement: Verification summary 必须支持低噪声消费
**Reason**: v2 summary 字段不再是 current authority。
**Migration**: portable Result 本身是低噪声消费模型，完整输出留在 transient execution。

### Requirement: OpenSpec contract fixtures必须复用identity-bound preparation
**Reason**: 这是 Buildr 产品测试实现细节，不属于 Task Verification capability contract。
**Migration**: 保留在产品 verification registry/runner 测试规范中。

### Requirement: Fixture preparation与assertion timing必须独立可审计
**Reason**: 这是产品测试执行细节，不是 current Result authority。
**Migration**: 保留在 product-verification-quality。

### Requirement: Scheduler必须显式组合run-local prepared artifact
**Reason**: 首版不建设通用 Task Verification DAG/scheduler。
**Migration**: 产品内部 scheduler 可继续按其测试 registry 工作。

### Requirement: 正式保证前必须执行候选感知的确定性preflight
**Reason**: Candidate assurance preflight 属于旧 lifecycle。
**Migration**: runner 只校验显式 capability、执行根、Environment binding、Workspace Node 与资源授权。

### Requirement: Verification evidence 必须区分首次验证与重新验证
**Reason**: 首版没有 Result history 或 rerun lineage。
**Migration**: 每次完整验证原子替换 current；中断不覆盖。

### Requirement: Verification failure summary 必须区分失败与warning
**Reason**: warning 门禁语义依赖旧 enforcement policy。
**Migration**: capability outcome 为 passed/failed，coverage gap 单列，整体为 passed/not-passed。

### Requirement: 验证资源协调必须跨 task environment 生效
**Reason**: v2 requirement 过度定义通用资源平台。
**Migration**: 仅对 Project v2 中真实声明的 coordinated/external claims 保留现有协调器实现。

### Requirement: 验证资源证据与清理必须绑定当前 run
**Reason**: 资源事实是 transient execution detail。
**Migration**: execution summary 继续绑定 run 并精确释放，不复制进 portable Result。

### Requirement: Verification step 必须在直接子进程退出后有界收敛
**Reason**: 该执行可靠性不应与 Result schema 混写。
**Migration**: 保留在 execution runner implementation 与产品测试中。

### Requirement: Verification execution 必须为收敛失败生成可信 summary
**Reason**: execution failure summary 与 current Result 的形成条件不同。
**Migration**: runner 继续生成 transient 诊断；只有完整 Task 结论形成后才 record current。

### Requirement: Buildr 必须提供可发布的 Project 验证执行器
**Reason**: 旧入口固化 affected/candidate assurance。
**Migration**: 使用显式 capability 的 `buildr verification run`。

### Requirement: 正式执行器必须并发调度 DAG 并协调跨任务资源
**Reason**: Project v2 不再声明 dependency/supersedes DAG。
**Migration**: 显式能力可有界并发；产品内部测试 DAG 保持独立实现。

### Requirement: 正式执行器必须生成可复用且可清理的 evidence
**Reason**: transient execution 不再被称为可复用 current evidence。
**Migration**: execution 可清理，复用判断只读取 portable current Result。

### Requirement: Production verification 必须使用单一 evidence lifecycle 契约
**Reason**: 单一 transient lifecycle 不能代表 Task current Result。
**Migration**: execution lifecycle 与 Result authority 明确分离，各自只有一个 schema。

### Requirement: Verification cleanup 必须是可安装的产品操作
**Reason**: cleanup 行为保留但不再属于 v3 Result capability requirement。
**Migration**: `verification cleanup` 继续清理 exact transient execution boundary。

### Requirement: 正式验证必须绑定 Workspace Node identity
**Reason**: Workspace Node 是执行上下文，不应复制进 portable Result。
**Migration**: runner 继续绑定并报告 Workspace Node；Result 只保留提炼事实。

## ADDED Requirements

### Requirement: Task Verification 必须维护一个 Task-scoped current Result
Buildr MUST 为每个正式 Task 提供至多一份 `.buildr/tasks/<task-id>/verification.yml`，其 schema MUST 为 `buildr.task-verification-result/v1`。Result MUST 只包含 Task/target、Project declaration identities、实际执行 capability facts、coverage gaps、整体结论与完成时间，并 MUST 可移植、可 Git 跟踪。

#### Scenario: 完整验证形成 current Result
- **WHEN** Agent 已针对一个明确 target 完成全部选择、执行和事实提炼
- **THEN** Application MUST 写入该 Task 唯一 current Result
- **AND** Result MUST NOT 包含 stdout、stderr、临时目录、本机绝对路径、Environment Receipt、resultDigest 或 applicability

#### Scenario: 没有测试能力
- **WHEN** Task scope 内某个目标没有可用声明或适用能力
- **THEN** Result MUST 通过 `coverageGaps` 如实记录缺口
- **AND** Verification MUST NOT 自动创建测试、脚本或 capability declaration

### Requirement: Result 必须使用关闭且最小的数据模型
Result MUST 绑定非空 `target.identity` 和可移植 `target.summary`；每个 declaration MUST 绑定 Project、相对 path 与当前 content identity 或 `absent`；每个实际 capability MUST 绑定 Project、capability identity、`passed|failed` outcome 与至少一个 portable fact；结论 MUST 只使用 `passed|not-passed`。

#### Scenario: 调用方提交 lifecycle authority 字段
- **WHEN** record 输入或持久 Result 包含 Candidate generation、assurance level、proceed、blocked decision、Task status、revision、history、CAS、execution path 或 raw output 字段
- **THEN** Application MUST 拒绝整个值
- **AND** 原 current MUST 保持不变

#### Scenario: 完整失败结论
- **WHEN** 已完成的能力执行产生失败事实且整体结论已经形成
- **THEN** Agent MAY 记录 `not-passed` current Result
- **AND** Result MUST NOT 决定是否带风险继续推进

### Requirement: Task Verification Application 必须是唯一 writer 和 reader
Task Verification Application MUST 独占 Result normalization、Task/Project resolution、declaration identity 观察、persistence 调用、Result digest 与 applicability 派生。CLI、Skill、Local App、Finish、Task Record 与 Task Environment MUST NOT 直接读写 Result store 或复制其字段 authority。

#### Scenario: CLI 记录 Result
- **WHEN** Agent 调用 `buildr task verification record <task-id>`
- **THEN** CLI MUST 只解析输入并调用同一 Application
- **AND** persistence writer 的静态调用方 MUST 只有 Task Verification Application

#### Scenario: declaration 尚在 Task Environment
- **WHEN** 当前 target 使用的 Project declaration bytes 尚未进入 canonical Workspace
- **THEN** inspect/record MAY 提供 `--declaration-root`，但 Application MUST 只接受该 Task 当前 matching ready Environment 的精确根
- **AND** Result MUST 只保存 Workspace 相对 declaration path 与 content identity，不得保存 declaration root

#### Scenario: Local App 查看 Result
- **WHEN** 用户在 Task 详情查看 Verification
- **THEN** Local App MUST 调用同一 Application 的 inspect read model
- **AND** 页面/API MUST NOT 暴露 direct Result writer

### Requirement: Result 必须原子整值替换且失败时保留 current
Repository MUST 在写入前完成 closed-schema normalization 与 serialization round-trip，再以同目录独占临时文件、重读验证和 atomic rename 整值替换 current。任何写入阶段失败 MUST 返回精确 stage/rollback 诊断，并 MUST 保留或恢复原 current bytes。

#### Scenario: 执行中断或完整结论尚未形成
- **WHEN** execution 被中断、超时、只完成部分能力或 Agent 尚未形成完整 Task 结论
- **THEN** caller MUST NOT 调用 record
- **AND** 已有 current MUST 保持不变

#### Scenario: rename 后 post-read 失败
- **WHEN** 新值已 rename 但 Repository 无法重读确认
- **THEN** Repository MUST 尝试恢复旧 bytes 或删除首次创建的新文件
- **AND** rollback 失败时 MUST 停止并报告精确文件与人工恢复要求

### Requirement: Applicability 必须由 target 与 declaration identities 派生
Application inspect MUST 对 target 与 Task scope 内全部 Project declaration 分别派生 applicability，不得把 applicability 持久化。任一 declaration 出现、消失、内容、registry/path 或 validity 变化 MUST 使 current Result stale；target identity 不同时 MUST stale；未提供当前 target 时 target 轴 MUST 为 unknown。

#### Scenario: target 与 declarations 均未变化
- **WHEN** inspect 提供的 target identity 等于 Result target，且所有当前 declaration observations 与 Result 相等
- **THEN** overall applicability MUST 为 `current`

#### Scenario: Local App 没有当前 target identity
- **WHEN** Local App 只读 inspect 且 declarations 仍 current
- **THEN** overall applicability MUST 为 `unknown`
- **AND** Application MUST NOT 从 HEAD、dirty tree、Environment 或时间伪造 target identity

#### Scenario: policy 内容变化
- **WHEN** 任一 Project `verification.yml` bytes 与 Result 中绑定的 identity 不同
- **THEN** overall applicability MUST 为 `stale`
- **AND** reader MUST 返回可解释的 declaration reason

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
Runner MUST 继续使用受管 Workspace Node、Environment allowed roots、进程 descendant 有界收敛、单次 transient cleanup 与被实际 capability claim 的资源协调。Project declaration execution MUST NOT 新建通用 DAG、dependency、supersedes、scheduler 或资源平台语义。

#### Scenario: 真实 coordinated capability 并发
- **WHEN** 两个 execution runs 声明并请求同一有限容量 coordinated resource
- **THEN** 现有 coordinator MUST 排队、绑定 owner/token/expiry 并精确释放
- **AND** 这些 lease 与等待事实 MUST 只存在于 transient execution evidence

#### Scenario: flat capability set
- **WHEN** 一个 execution 选择多个互不依赖的 capabilities
- **THEN** runner MAY 有界并发执行
- **AND** declaration 与 Result MUST 不包含 `dependsOn`、`supersedes` 或 DAG status

### Requirement: Verification 不得拥有 Task 推进或其他专业 authority
Task Verification MUST NOT 创建 Candidate generation、更新 Task 顶层状态、决定 proceed/blocked、实现缺失测试、替代 Task Review/Environment/业务验收，或发布 metadata。Consumer MAY 根据 current Result 做自己的 fail-closed 决定，但 MUST NOT 回写该决定为 Verification 字段。

#### Scenario: Finish 消费 not-passed Result
- **WHEN** 临时 Finish adapter 读取到 current 且 `not-passed` 的 Result
- **THEN** Finish MAY 按自身交付门禁停止
- **AND** Verification Result MUST 保持原事实，不得新增 blocked/proceed 或 Finish stage
