# OpenSpec contract guard 规范

## Purpose

定义 Buildr 对 OpenSpec change 的 Requirement 基线、跨 change 冲突、同步前后验证、上游兼容性和 Agent-readable CLI 契约。

## Requirements

### Requirement: Buildr 维护 OpenSpec change 契约基线
Buildr MUST 将新 deterministic convergence 的 canonical before facts 直接包含在唯一 convergence identity/receipt 中，正常收敛 MUST NOT 要求独立 contract baseline。Buildr MAY 只读解析历史 `.buildr/contract-baseline.json` 用于兼容诊断，但 MUST NOT 在新 converge 正常路径创建、刷新或把 adopted baseline 当作事后授权。

#### Scenario: 新 change 创建基线
- **WHEN** active Change 的完整 delta 准备收敛
- **THEN** planner MUST 从当前 canonical 建立 receipt-bound before facts
- **AND** MUST NOT 先写独立 contract baseline sidecar

#### Scenario: 历史change包含baseline
- **WHEN** active Change 含历史 contract baseline 与完整旧 plan/receipt
- **THEN** compatibility reader MAY 核对其 identity chain
- **AND** 缺少任一可证明事实时 MUST 返回 `recovery-unprovable` 而不得 adopt current

#### Scenario: 历史 change 缺少基线
- **WHEN** 历史 active Change 没有 contract baseline
- **THEN** 新 transaction MUST 只根据当前 delta、canonical 与 executable 建立新计划
- **AND** MUST NOT 事后创建或接纳 baseline 作为旧执行授权

#### Scenario: 基线随 change 归档
- **WHEN** OpenSpec 将含历史 baseline 的 active Change 移入 archive
- **THEN** 历史 sidecar MUST 随 Change 原样移动
- **AND** Buildr MUST NOT 将其解释为当前 canonical authority

### Requirement: Proposal capability、delta 与基线保持一致
Buildr MUST 在 proposal 与 converge 入口校验 proposal capability、delta spec、当前 canonical capability 分类和 convergence identity 形成完整且无歧义的集合；新路径 MUST 将这些事实纳入 plan decision，而不是要求独立 baseline coverage。

#### Scenario: Proposal 与 delta 对齐
- **WHEN** Agent 对 Change 运行 proposal check 或产品开始 converge
- **THEN** proposal 中 new/modified capability MUST 与 delta spec capability 目录一一对应
- **AND** new/modified 分类 MUST 与当前 canonical capability 是否存在一致

#### Scenario: 基线覆盖全部操作
- **WHEN** delta 声明 ADDED、MODIFIED、REMOVED 或 RENAMED Requirement
- **THEN** planner MUST 收集该操作涉及的全部 Requirement identity 与 canonical before facts
- **AND** 任一 identity 不能唯一证明时 MUST blocked

#### Scenario: Delta 在基线后扩张
- **WHEN** delta 在 receipt 计划后新增或改变 Requirement identity
- **THEN** 旧 convergence identity MUST 失效
- **AND** Buildr MUST 基于当前 canonical 重新规划而不是更新旧 baseline

### Requirement: 同一 Requirement 的活动 change 冲突必须阻塞
Buildr MUST 在同步前扫描同一 Project 的全部 active changes，并以 capability 与 Requirement identity 识别并行契约冲突。

#### Scenario: 两个 change 修改同一 Requirement
- **WHEN** 两个 active changes 的 delta 触达相同 capability 和 Requirement identity
- **THEN** pre-sync check MUST 失败
- **AND** JSON diagnostics MUST 列出全部冲突 change、capability、Requirement 和可执行的排序或合并下一步

#### Scenario: 同 capability 的不同 Requirement
- **WHEN** 两个 active changes 只触达同一 capability 中不同的 Requirement identity
- **THEN** Buildr MUST NOT 仅因 capability 相同而报告冲突

#### Scenario: Rename 占用两个 identity
- **WHEN** change 将 Requirement 从旧名称重命名为新名称
- **THEN** conflict detection MUST 同时将旧名称和新名称视为该 change 触达的 identity

### Requirement: 陈旧 Requirement 基线必须阻塞同步
Buildr MUST 在条件式 apply 前比较当前 canonical 文件 digest 与 plan 的 beforeDigest，并在 touched 文件变化时放弃旧 plan、重新观察与规划。Buildr MUST NOT 自动覆盖并发修改，也 MUST NOT 通过刷新 baseline 继续应用旧 expected content。

#### Scenario: 基线仍然有效
- **WHEN** 当前 canonical 文件 digests 与 plan 的 before digests 全部相同
- **THEN** applier MUST 允许继续执行 identity-bound apply

#### Scenario: 较早 change 已改变主规格
- **WHEN** 当前 canonical 任一文件不再匹配 plan before digest
- **THEN** apply MUST 保持零写入并触发重新规划
- **AND** 新 plan MUST 以当前 canonical 为 before，保留前序 Change 的内容

#### Scenario: 新增目标已被占用
- **WHEN** plan 后当前 canonical 已出现同名 ADDED Requirement
- **THEN** 重新规划 MUST 将相同内容识别为 already-applied或将不同内容识别为 semantic conflict

### Requirement: 同步结果必须符合 delta 且保持未触达契约
Buildr MUST 通过 plan 的完整 expected files 和写后 actual digests 确认 delta 结果与未触达契约，并在真实 Project 执行 strict validation。Confirmation failure MUST 提供文件、expected/actual digest、operation 与最小下一动作；不得自动恢复 canonical、修改 delta 或刷新 baseline。

#### Scenario: 安全同步完整通过
- **WHEN** actual canonical digests 全部等于 expected digests且 strict validation通过
- **THEN** confirmation MUST 成功并将 receipt disposition 记录为 `applied-and-matched`
- **AND** 未触达 Requirement MUST 由完整 expected file digest 证明保持不变

#### Scenario: 未声明的 Requirement 被删除或改写
- **WHEN** actual canonical 文件不等于 plan expected digest
- **THEN** confirmation MUST 失败并返回 `recovery-unprovable`
- **AND** finding MUST 标识文件和 expected/actual digest

#### Scenario: MODIFIED 使用不完整结果
- **WHEN** MODIFIED Requirement 没有保留或明确重定义既有 Scenario identity
- **THEN** planner MUST 在任何 canonical 写入前返回 `blocked`
- **AND** Agent MUST 先完成语义解决再重新收敛

#### Scenario: Delta 在 pre-sync 后变化
- **WHEN** 当前 delta digest 与 convergence identity 不同
- **THEN** projected validation或apply MUST失效
- **AND** Buildr MUST重新观察并规划，不得继续旧结果

#### Scenario: canonical 在 pre-sync 前已被写入
- **WHEN** transaction 首次观察时 canonical 已包含 delta 的完整预期结果
- **THEN** planner MUST 将对应操作识别为 `already-applied`
- **AND** 后续仍 MUST 通过写后严格验证确认真实状态

### Requirement: OpenSpec 契约门禁提供稳定 CLI 和 Agent-readable 输出
Buildr MUST 提供 project-scoped `openspec converge` CLI，并为 `passed`、`blocked` 和 `recovery-unprovable` 返回稳定文本及 JSON。历史 baseline/check/sync-plan/sync-apply CLI MAY 在兼容期保留诊断能力，但 MUST NOT 成为 Task Finish 正常路径或生成新阶段型 sidecar。

#### Scenario: 通过 workspace 与 Project 解析 planning root
- **WHEN** Agent 指定 `--target <workspace>`、`--project <project>` 和 Change id
- **THEN** Buildr MUST 通过 Project registry 解析对应 OpenSpec planning root
- **AND** MUST NOT 依赖调用者当前目录猜测 Project

#### Scenario: Agent-readable check 输出
- **WHEN** Agent 使用 `--json` 运行 converge
- **THEN** 输出 MUST 包含 change、project、status、convergence/plan identity、disposition、validation/apply/confirmation/archive摘要、duration、commandCount、receipt和nextActions
- **AND** `blocked` 与 `recovery-unprovable` MUST 返回非零状态

#### Scenario: Planning root 或 change 不合法
- **WHEN** Project、OpenSpec planning root、Change 或 receipt 无法安全解析
- **THEN** Buildr MUST 在 canonical 写入前失败
- **AND** 输出 MUST 提供具体诊断而不是创建猜测路径

### Requirement: 未验证的 OpenSpec 上游版本不得绕过门禁
Buildr MUST 将 contract parser 与 OpenSpec Component 声明的上游版本绑定，并对未知或不一致版本 fail closed。

#### Scenario: 上游版本受支持
- **WHEN** workspace OpenSpec Component、OpenSpec Command 声明、本机 CLI、baseline 和 guard 支持的上游版本一致
- **THEN** Buildr MUST 继续执行对应阶段检查

#### Scenario: 上游版本未知或不一致
- **WHEN** OpenSpec Component 或 Command 声明缺失、本机 CLI 不满足声明、upstream version 未被 guard 支持，或 baseline version 与当前版本不一致
- **THEN** Buildr MUST 阻止门禁通过
- **AND** nextActions MUST 引导升级或重新验证 Buildr/OpenSpec Component，而不是自动安装外部 CLI

### Requirement: OpenSpec 契约 sidecar 原子写入
Buildr MUST 通过受管数据完整性 atomic writer 提交唯一 `convergence-receipt.json`，使 receipt 不会以截断或半写入状态替代上次有效事实。新 converge 正常路径 MUST NOT 写 contract baseline、pre-sync receipt、deterministic sync plan 或 recovery receipt。

#### Scenario: Baseline 写入成功
- **WHEN** plan 与 projected validation 通过全部契约和路径预检
- **THEN** Buildr MUST 在首个 canonical replace 前原子写入 `planned-not-applied` receipt
- **AND** receipt MUST 包含完整 before/expected content 与 digests

#### Scenario: Receipt 写入失败
- **WHEN** 首次或更新 receipt 写入发生 I/O 失败
- **THEN** Buildr MUST 保留上次完整 receipt 或保持 receipt 不存在
- **AND** 首次 receipt 不存在时 MUST NOT 开始 canonical apply

#### Scenario: OpenSpec Component 卸载
- **WHEN** workspace OpenSpec Component 被卸载
- **THEN** Component transaction MUST NOT 删除任何 Project Change 内的历史或新 `.buildr/` sidecar

### Requirement: Contract guard必须与sync receipt共享identity
Contract conflict detection、planner、projected validation、canonical apply、写后 confirmation 与 archive MUST 消费同一 convergence identity。任何 delta、canonical before 或 executable identity 变化 MUST 重新规划或重新验证，不得通过阶段 transition、事后 baseline 或旧 validation 继续。

#### Scenario: Guard与apply正常衔接
- **WHEN** active conflict scan、planner、validator 与 applier 消费同一 identity
- **THEN** confirmation MUST 核对 actual canonical digest等于receipt expected digest
- **AND** 未触达 Requirements MUST 保持不变

#### Scenario: Planner blocked后Agent修订
- **WHEN** planner blocked且Agent修订delta或解决active Change语义
- **THEN** consumer MUST重新调用完整 converge
- **AND** 产品 MUST基于当前事实建立新 identity而不得伪造已通过阶段

#### Scenario: Agent fallback后恢复
- **WHEN** Agent 已解决 planner 报告的语义冲突
- **THEN** Task Finish MUST 重新调用完整 convergence transaction
- **AND** 新计划 MUST 使用当前文件事实而不是旧回执阶段

### Requirement: Convergence receipt必须持久化阶段恢复证据
产品 orchestrator MUST 只持久化影响恢复决策的 convergence/plan identity、before/expected facts、当前 disposition、验证/应用/确认/归档结果与时间。Planner、validation、apply、confirmation 和 archive 的本次执行 timing MAY 出现在命令结果中，但 receipt MUST NOT 用长期 stage transitions 决定 resume。

#### Scenario: 中间阶段失败后resume
- **WHEN** apply、confirmation或archive失败后再次调用converge
- **THEN** observer MUST先根据当前canonical与receipt before/expected digests判断 disposition
- **AND** resume MUST只执行由实际文件事实要求的动作

#### Scenario: 状态机记录与文件事实冲突
- **WHEN**旧sidecar声称某阶段完成但canonical不匹配其before或expected结果
- **THEN**文件事实 MUST优先
- **AND**Buildr MUST返回`recovery-unprovable`而不得修补stage记录

### Requirement: OpenSpec delta identity 必须独立于 checkout 位置
Buildr MUST 仅从按确定顺序排列的逻辑 delta 文件标识和规范化 delta 内容计算 `deltaHash`。每个逻辑标识 MUST 使用 `specs/<capability>/spec.md` 形式的 POSIX 路径；`changeRoot`、绝对源文件路径、主机目录和路径分隔符 MUST NOT 影响该 hash。

#### Scenario: 相同 delta 位于不同 checkout
- **WHEN** 两个干净 checkout 在不同绝对路径下包含相同 capability、逻辑 delta 文件和规范化内容
- **THEN** Buildr MUST 为它们生成相同的 `deltaHash`
- **AND** 该 identity MUST 可用于同一 Change 的跨 checkout 收敛比较

#### Scenario: 逻辑 delta 输入发生变化
- **WHEN** delta 的 capability 逻辑路径或规范化内容发生变化
- **THEN** Buildr MUST 生成不同的 `deltaHash`

#### Scenario: 遇到旧的本机路径 hash
- **WHEN** 已存 receipt 的 delta digest 与新的可移植 `deltaHash` 不同
- **THEN** Buildr MUST 将旧 identity 视为不再可复用并按当前 canonical 事实重新规划
- **AND** MUST NOT 为了匹配当前 hash 而改写或采用旧 receipt

### Requirement: OpenSpec Contract Guard必须前置语义就绪门禁
OpenSpec Contract Guard MUST 在Change artifacts达到apply-ready并通过上游strict validation后、实现前调用semantic readiness preflight。`ready`时Agent MAY直接apply或按目标执行Planning Review；`blocked`时 MUST停止apply并处理最小语义问题。Guard MUST NOT调用Task Planning Identity、Task Development或把Planning Review设为apply门禁。

#### Scenario: Preflight ready后进入Planning Review
- **WHEN** 当前Change的semantic readiness preflight返回`ready`
- **THEN** sidebar MUST允许Agent直接apply或选择审查当前真实artifacts
- **AND** MUST说明ready只覆盖当前OpenSpec观察，不替代最终converge或实现验证

#### Scenario: 内在语义问题阻塞
- **WHEN** preflight返回`scenario-omission`、`identity-conflict`、`projected-validation`或其他`semantic-resolution-required`
- **THEN** sidebar MUST在apply前停止并要求Agent修订Change artifact或请求用户决定
- **AND** 修订后 MUST重新运行upstream strict与preflight

#### Scenario: Active Change冲突阻塞
- **WHEN** preflight返回`active-change-conflict`
- **THEN** sidebar MUST列出冲突Change、capability和Requirement，并要求Agent处理前序依赖、合并语义或重划范围
- **AND** MUST不把时序冲突自动改写为当前Change artifact内容

### Requirement: Semantic readiness preflight必须保持无持久副作用
Contract Guard preflight MUST只返回当前观察结果，`effects` MUST为空；它 MUST NOT写入canonical spec、Change `.buildr/` sidecar、Convergence Receipt、archive、Task Development、Task Review、Task Verification或Workspace SQLite。临时projected validation surface MUST由运行期清理且不得成为authority。

#### Scenario: Preflight通过或阻塞
- **WHEN** 任一preflight执行完成、失败或被blocker终止
- **THEN** active Change、canonical specs、Receipt、archive和Task专业事实 MUST保持不变
- **AND**结果 MUST只报告readiness、diagnostics和nextActions
