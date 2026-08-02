# task-finish-execution Specification

## Purpose

定义 Task Finish 如何把一个逻辑任务的收尾持久化为可检查、可恢复、可精确失效且支持并发资源协调的独立执行 run。

## Requirements

### Requirement: Task Finish 必须是固定五阶段执行器
Buildr MUST 以 `preflight → prepare → verify → deliver → cleanup` 五个固定阶段执行 Task Finish，MUST NOT 把普通动作暴露为需要 Agent completion 的可扩展 step、action registry 或通用 provider DAG。阶段状态 MUST 只表达 `pending|running|passed|blocked|failed|not-applicable`，其中 `blocked` 只用于同一冻结候选可安全恢复的外部条件，`failed` MUST 退出 Finish 并回到研发流程。

#### Scenario: 正常候选进入收尾
- **WHEN** 调用方对 finish-ready candidate 执行 `buildr task finish run`
- **THEN** 产品 MUST 按五阶段顺序连续执行到完成或真实停止边界
- **AND** 正常路径 MUST NOT 请求调用方提交 step outcome、attempt、effect、evidence、fingerprint、execution plan 或 recovery manifest

#### Scenario: 固定阶段内包含多个机械动作
- **WHEN** prepare 或 deliver 需要执行多个确定性子动作
- **THEN** 产品 MUST 将它们记录为阶段 operations/observations
- **AND** MUST NOT 因新增一个机械动作而扩展公共 workflow step 数量

### Requirement: Preflight 必须一次聚合廉价门禁
`preflight` MUST 在任何 delivery mutation 前执行全部适用的廉价无副作用检查，并一次聚合 environment executable、change/tasks、knowledge impact、OpenSpec plan/validation、Git/target、verification policy、retained root 与 cleanup ownership findings。Preflight 有 error 时 MUST 零 delivery mutation，且 MUST NOT 每次只返回一个可同时发现的问题。

#### Scenario: 候选同时存在多个廉价问题
- **WHEN** receipt-bound CLI 不可执行、OpenSpec delta 不完整且 verification policy 不可解析
- **THEN** preflight MUST 在同一结果中按 check identity 返回全部三个 error
- **AND** prepare、verify、deliver 与 cleanup MUST 保持未执行

#### Scenario: Receipt 只证明路径身份
- **WHEN** environment receipt 的 CLI 路径与 digest 匹配，但真实 executable probe 无法加载依赖或运行 context/version
- **THEN** preflight MUST 返回 `environment-cli-unexecutable`
- **AND** MUST NOT 把 receipt 的 `executionReady` 字段单独当成可执行证据

### Requirement: Task Finish 必须只接受 finish-ready candidate
进入 Task Finish 的候选 MUST 已完成研发、审查和前序测试验证。Task Finish MAY 执行一次最终 required assurance 证明候选可交付，但任何产品缺陷、语义冲突、审查缺口或验证失败 MUST 分类为 `upstream-candidate-defect` 并退出当前 Finish；修复、返工和重新验证 MUST 回到研发流程处理，MUST NOT 成为 Finish action、timing 或 recovery。

#### Scenario: Preflight 发现产品缺陷
- **WHEN** cheap checks 证明实现、规范、生成资产或任务内容存在产品缺陷
- **THEN** run MUST 标记 terminal `failed` 并返回 `nextWorkflow: task-development`
- **AND** MUST NOT 在 Finish 中编辑候选修复该缺陷

#### Scenario: 正式保证发现测试失败
- **WHEN** frozen candidate 的 required assurance 返回 failed
- **THEN** run MUST 返回真实 failed check/stage、failure identity 与研发流程 handoff
- **AND** MUST NOT 接受 repair authorization、implementation recovery 或同 run re-verification

### Requirement: Prepare 必须收敛并冻结唯一候选
`prepare` MUST 完成全部允许改变 delivery candidate 的确定性动作，包括 OpenSpec convergence、受管生成资产收敛、候选提交、目标 fetch/rebase 和 rebase 后 fixed-point 检查。所有 repository clean 后，产品 MUST 生成绑定每仓 HEAD/tree、change/archive、canonical specs、runtime projection 和 expected target ref 的 frozen candidate identity。Freeze 后任何 candidate content 或 identity 改变 MUST 使当前 run terminal failed。

#### Scenario: Prepare 到达固定点
- **WHEN** convergence、生成资产、commit 与 target rebase 完成且再次观察不再产生 delta
- **THEN** 产品 MUST 写入唯一 freeze record 并进入 verify
- **AND** 后续阶段 MUST 只消费该 candidate identity

#### Scenario: Freeze 后候选变化
- **WHEN** verify、deliver 或 resume 前观察到任一候选 HEAD、tree、canonical spec 或 runtime projection 与 freeze record 不同
- **THEN** 当前 run MUST 返回 `candidate-changed-after-freeze`
- **AND** MUST 结束当前 run，由研发流程修正实现并形成新的 finish-ready candidate，不得回到 prepare 自动吸收变化

### Requirement: Verify 必须对冻结候选最多执行一次正式保证
`verify` MUST 从 Project policy 解析最低充分 `requiredAssurance`，并对 frozen candidate 至多执行一次正式 verification executor。已有 evidence 只有在完整匹配 frozen candidate 与 policy 时才能复用；执行结果 MUST 投射具体 check/stage、exit/status、bounded findings、diagnostic identity 和 verifier wall-clock。

#### Scenario: 缺少可复用 evidence
- **WHEN** frozen candidate 没有满足 required assurance 的可信 evidence
- **THEN** verify MUST 启动一次正式 executor
- **AND** 同一 run 的 `formalVerificationExecutions` MUST 等于 1

#### Scenario: 已有完全匹配 evidence
- **WHEN** 可信 evidence 完整匹配 frozen candidate、policy 与 required assurance
- **THEN** verify MUST 复用 evidence且不启动 executor
- **AND** MUST 记录 `formalVerificationExecutions: 0` 与复用 identity

#### Scenario: 验证输出包含次级 warning
- **WHEN** 正式 executor 同时返回 primary failure 和 timing/evidence warning
- **THEN** Task Finish MUST 把真实 failed check/stage 作为 primary failure
- **AND** warning MUST NOT 覆盖失败定位或退化为 `primaryFailure: null`

### Requirement: Deliver 必须只交付冻结候选
`deliver` MUST 在短 target lease/fencing 边界内重新核对 expected target ref，只允许 frozen candidate 的 fast-forward 或内容等价 transition、普通 push、retained Workspace convergence 与受影响入口安装。Force push、merge commit、远端任务分支 push/delete、丢弃改动和语义冲突 resolution MUST 保持未授权。

#### Scenario: 目标 ref 未漂移
- **WHEN** observed target ref 等于 freeze record 的 expected target ref
- **THEN** deliver MUST 完成明确 ref transition、普通 push 与 retained convergence
- **AND** result MUST 记录 before/candidate/after remote ref

#### Scenario: 目标 ref 外部前进
- **WHEN** push 前 observed target ref 不再等于 expected target ref
- **THEN** deliver MUST 返回 resumable `target-race` 并释放 lease
- **AND** MUST NOT 重跑 verify、force push 或自行解决内容冲突

#### Scenario: Retained 入口受影响
- **WHEN** frozen candidate 改变 runtime、默认 CLI 或 Local App 的正式影响路径
- **THEN** deliver MUST 使用 receipt-bound retained root、CLI 与 Node identity 执行相应 doctor/sync/install
- **AND** 未受影响入口 MUST 记录 not-applicable reason 而不执行安装

### Requirement: Resume 必须由产品根据真实状态生成
Task Finish MUST 根据 current run、freeze record、command observations、target ref 与 retained/cleanup 真实状态生成最早可恢复边界和 `resumeToken`。调用方 MUST NOT 提供 recovery manifest、step fingerprint、execution plan 或 claimed outcome。只有 candidate 未变的 transient target、retained 或 cleanup 阻塞可以在同一 run 恢复。

#### Scenario: 暂态条件解除
- **WHEN** run 因 target lease 或 retained install 暂态失败而 blocked，且再次观察证明 candidate 未变、条件已解除
- **THEN** 重复 canonical run 或匹配 resume token MUST 从最早 blocked phase 继续
- **AND** 已通过的 prepare/verify MUST 保持复用

#### Scenario: 恢复状态无法证明
- **WHEN** before/after identity 无法证明同一 frozen candidate 与允许 transition
- **THEN** 产品 MUST fail closed 并生成具体 diagnostic
- **AND** MUST NOT 要求 Agent 猜测或手写 recovery JSON

### Requirement: Cleanup 必须由 retained checkout 完成真实收尾
`cleanup` MUST 由 retained finalizer 先写 durable Finish completion/delivery facts，再通过 Environment Receipt 中的稳定 controller 向 selected `buildr.task-environment/v1` provider 提交每个工作范围的 delivery identity 与 cleanup eligibility。Task Environment MUST 独占资源停止、provider cleanup、共享根解除占用和 Environment cleanup result；Task Finish MUST 只记录 handoff/result summary，MUST NOT 直接扫描资源、调用 worktree cleanup、删除 branch/checkout 或写第二份环境结论。

#### Scenario: 资源可安全清理
- **WHEN** frozen candidate 已交付、Finish completion durable，且 Environment 复核全部 Task-owned 资源/provider evidence 可安全处置
- **THEN** Task Environment MUST 停止动态资源、调用适用 provider cleanup 并返回 removed/retained evidence
- **AND** Finish cleanup stage MUST 记录 Environment result reference/status 后完成 run

#### Scenario: Task-owned 资源仍在运行或无法证明
- **WHEN** Environment cleanup 观察到 matching preview/runtime 未停止、provider identity 不匹配、shared root ownership 不明或其他 Task 仍占用资源
- **THEN** Environment MUST 返回 resumable `blocked` 并保留现场
- **AND** Finish MUST 只保留 cleanup resume point，不得重跑 prepare、verify、deliver 或自行终止/删除资源

#### Scenario: Finish 尝试直接调用 Git provider
- **WHEN** Finish cleanup path 绕过 Task Environment 请求 `worktree cleanup`、删除 branch/checkout 或解释 provider evidence
- **THEN** product verification MUST fail 并指出越过 Environment authority 的调用路径
- **AND** Git provider MUST 只接受 Task Environment 提供的 matching cleanup handoff

#### Scenario: Environment 已清理但 Finish 尚未完成
- **WHEN** Environment Receipt 已记录 matching complete cleanup，而 Finish run 因 retained metadata 写入等后续暂态条件中断
- **THEN** resume MUST 复用同一 Environment result，不得再次停止资源或调用 provider cleanup
- **AND** Finish MUST 只完成自己尚未持久化的 result/completion 动作

### Requirement: Current run 与结果必须直接表达阶段、失败和效率
Canonical Task Finish MUST 写入 `buildr.task-finish-run/v1` 并返回 compact `buildr.task-finish-result/v1`。结果 MUST 包含 task/change/candidate/target identity、五阶段状态与 timing、当前 primary failure、bounded diagnostic、resume/development handoff、formal verification execution count、product command observations、CLI invocation count、Agent provider completion count、manual recovery count、wall-clock coverage 和 cleanup/completion。Full detail MUST 通过有界 digest 绑定引用提供，不得让大日志淹没 compact failure。

#### Scenario: 正常路径完成
- **WHEN** 五阶段全部成功或 not-applicable
- **THEN** result MUST 报告 `status: complete`、durable completion 和全部效率字段
- **AND** MUST 明确 `agentProviderCompletions: 0`、`manualRecoveryManifests: 0` 与实际 formal verification count

#### Scenario: 中途失败
- **WHEN** 任一阶段 blocked 或 failed
- **THEN** compact result MUST 直接包含 phase、operation/check、code/status/exit、diagnostic identity 和唯一 next workflow/action
- **AND** 已解决的历史失败 MUST NOT 继续作为 current primary failure

### Requirement: 客户端升级必须直接替换 Task Finish 实现
Buildr Client 升级后 MUST 直接以当前五阶段执行器替换旧 Task Finish 实现，继续使用唯一 canonical `.buildr/task-finish/runs`、`completed` 与 lease namespace。客户端 MUST NOT 创建 `runs-v2`、`completed-v2`、`task-finish-v2` 或其他并行协议目录，也 MUST NOT 保留旧 action、旧状态机、旧 executor、兼容 reader 或状态迁移模块。

#### Scenario: 升级后存在旧的未完成 run shape
- **WHEN** canonical run store 中存在不符合当前五阶段 shape 的旧 run
- **THEN** 自动恢复 MUST 跳过该状态，显式 inspect MUST fail closed
- **AND** 客户端 MUST NOT advance、finalize、迁移、转换或继续该旧 run

#### Scenario: 用户不升级客户端
- **WHEN** 用户继续运行旧 Buildr Client
- **THEN** 旧客户端及其旧协议行为不受新客户端代码影响
- **AND** 当前客户端代码库 MUST NOT 为此维护双协议、兼容或状态迁移分支

### Requirement: 正常路径必须满足硬自动化验收
Buildr Product MUST 以真实 task environment journey 验收 Task Finish 正常路径：一次用户授权后只启动一次 canonical Task Finish CLI，Agent 不完成 provider checkpoint、不手写恢复，正式验证至多一次，五阶段连续到 completion。Benchmark MUST 分别记录 preflight、prepare、verify、deliver、cleanup、产品执行、外部等待和端到端 wall-clock，MUST NOT 推断 token 数量。

#### Scenario: 无冲突普通任务收尾
- **WHEN** finish-ready candidate、目标分支和运行环境均满足正常条件
- **THEN** journey MUST 断言 `canonicalCliInvocations: 1`、`agentProviderCompletions: 0`、`manualRecoveryManifests: 0`、`formalVerificationExecutions <= 1`
- **AND** MUST 证明 commit、convergence、push、retained action 与 cleanup 真实发生，而不是只检查 JSON 字段形状

#### Scenario: 产品缺陷被发现
- **WHEN** journey 注入一个会被 preflight 或 verify 发现的产品缺陷
- **THEN** Task Finish MUST 一次返回具体 upstream-candidate-defect
- **AND** benchmark MUST 在该 failure 结束，不把后续修复或 re-verification 计入 Finish wall-clock

### Requirement: Task Finish 必须冻结并核验 Workspace Node identity
Task Finish MUST 在 preflight 读取 Workspace Node identity，在 candidate freeze 中保存该 identity，并在 verify、deliver、resume 与 evidence reuse 前重新核验。Finish 的 CLI、npm、验证和子进程 MUST 使用该 identity 对应的受管 runtime。

#### Scenario: Finish 复用匹配证据
- **WHEN** frozen candidate、assurance、policy 与 Node identity 均匹配已通过 evidence
- **THEN** Finish MAY 复用 evidence 且 MUST 在结果中披露 Node identity

#### Scenario: Candidate 与 Finish Node 不一致
- **WHEN** Candidate evidence 的 Node identity 与 Finish preflight/freeze identity 不同或 evidence 缺失该字段
- **THEN** Finish MUST 停止复用旧 evidence
- **AND** MUST 返回要求 `sync` 和重新验证的稳定 failure/next workflow

#### Scenario: Finish 运行中 Node identity 漂移
- **WHEN** 声明或受管 runtime identity 在 freeze、verify、deliver 或 resume 之间改变
- **THEN** Finish MUST fail closed 且不得继续 push、cleanup 或复用之前阶段

### Requirement: Task Finish 必须支持无 Change 的 code-only 候选
Task Finish MUST 以 receipt-bound task identity 作为所有 run 的主身份，并 MUST 允许调用方在不提供 OpenSpec Change 时创建 `candidateKind: code-only` 的 run。`project`、task environment、目标分支、Workspace Node identity 和 finish-ready candidate 保证 MUST 保持必需；产品 MUST NOT 为无 Change 候选创建、推断或选择虚假 Change。

#### Scenario: Code-only task environment 进入收尾
- **WHEN** 一个 `code-only + implementation` 任务在 receipt-bound canonical task environment 中达到 finish-ready，且调用方提供 Project 但不提供 Change
- **THEN** `task finish run` MUST 创建绑定 receipt task identity 的 `code-only` run
- **AND** MUST 继续执行候选提交、冻结、正式验证、目标分支交付、retained convergence 与 task-owned cleanup

#### Scenario: Change 候选保持兼容
- **WHEN** 调用方在 receipt-bound task environment 中同时提供 Project 与 Change
- **THEN** `task finish run` MUST 创建 `candidateKind: change` 的 run 并保持现有 Change 收敛语义
- **AND** 现有调用方 MUST NOT 被要求新增 caller task、fingerprint 或 execution plan

#### Scenario: 非 task environment 调用产品执行器
- **WHEN** 调用方直接从 retained canonical Workspace 启动产品 `task finish run`
- **THEN** 产品执行器 MUST 继续以稳定 `not_task_environment` 诊断拒绝
- **AND** MUST NOT 因 code-only 支持而在 dirty retained tree 中 stage、commit、verify 或移动用户改动

### Requirement: Code-only run 必须明确记录 Change 动作不适用
Task Finish MUST 对 code-only run 的 Change tasks、knowledge impact、OpenSpec strict/pure plan 和 convergence operation 返回稳定 `not-applicable` evidence，并 MUST 让其余适用门禁继续生效。结果、冻结身份和 completion receipt MUST 包含 task、`candidateKind`、可空 Change 与 Workspace Node identity。

#### Scenario: Code-only preflight
- **WHEN** preflight 处理 `candidateKind: code-only`
- **THEN** environment/CLI、Node、Project verification policy、Git/target 与 retained readiness MUST 正常检查
- **AND** Change/OpenSpec 专属 checks MUST 返回 `not-applicable`，不得执行 OpenSpec 命令或报告缺少 Change

#### Scenario: Code-only prepare
- **WHEN** code-only run 进入 prepare
- **THEN** prepare MUST 跳过 `openspec converge`，并继续 runtime sync、candidate commit、target convergence、fixed point 与 freeze
- **AND** command observations MUST 证明没有向 OpenSpec executable 传入空或推断的 Change identity

#### Scenario: Code-only completion
- **WHEN** code-only run 完成 deliver 与 cleanup
- **THEN** durable completion MUST 记录 `candidateKind: code-only`、task、`change: null`、candidate ref 和目标分支
- **AND** Change consumers MUST 能以 `candidateKind` 区分 not-applicable，而不是把 null Change 误报为丢失数据
