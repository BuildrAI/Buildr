## ADDED Requirements

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
`cleanup` MUST 在 retained checkout 先写 durable completion，再清理 verification transient evidence、task-owned runtime/process 和本地 task environment/branch。删除前 MUST 证明 integration/push 已完成、repository clean、资源 owner 匹配且其他任务不受影响；无法证明时 MUST 保留现场并只阻塞 cleanup。

#### Scenario: 资源可安全清理
- **WHEN** frozen candidate 已交付、completion receipt durable 且所有 task-owned 资源可证明
- **THEN** retained finalizer MUST 删除允许的本地资源并完成 run
- **AND** completion MUST 记录 removed/retained resources 与 cleanup status

#### Scenario: Task-owned 进程仍在运行
- **WHEN** cleanup 观察到匹配 owner 的 preview 或 runtime 尚未停止
- **THEN** cleanup MUST 返回 resumable blocked 并保留 environment
- **AND** MUST NOT 重跑 prepare、verify 或 deliver，也不得终止未知进程

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

## REMOVED Requirements

### Requirement: Task Finish 使用独立持久化 run 渐进执行
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish run 只恢复失效或阻塞的下游
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: 正式验证发生在 delivery convergence 之后
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: 并发 finish run 只锁定共享资源
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: CLI 提供 inspect advance resume
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish run identity 必须限制在 canonical state root
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish step completion 必须携带最小可信证据
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Shared lease 必须使用 fencing identity
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish step 执行计划必须可预检
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Shared lease 必须支持受 fencing 约束的续租
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish run 必须报告完整阶段和重试耗时
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish run 必须支持晚期资产审查
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish run 必须支持安全自动执行
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish run 必须支持 identity-bound 多阶段编排
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Integration push 必须表达完整 ref transition
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Invalidation 必须原子终结 attempt 与 lease
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Cleanup completion 必须绑定真实删除与 durable receipt
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish CLI 默认返回 compact progress evidence
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish timing 必须区分执行与编排成本
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish必须消费产品持有的convergence orchestrator
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish入口必须解析权威execution roots
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Completion receipt必须持久化完整效率证据
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Full detail必须使用有界诊断引用
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish benchmark必须测量执行与Agent编排
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Finish run必须支持原子identity recovery
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Compact failure必须保留可恢复的结构化诊断
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Completion metrics必须声明可观察coverage
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Recovery性能必须进入真实finish benchmark
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须在正式保证失败后等待 repair 决策
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须区分 workflow 与 closeout-only timing
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish compact diagnostic 必须优先暴露真实失败
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须持有版本化 action registry
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须区分登记 provider 与 Agent 推理 fallback
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须提供 action registry 查询入口
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Registry 驱动执行必须兼容现有 finish evidence
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须在集成后收敛 retained Workspace
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Retained convergence 必须支持精确恢复
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Retained convergence evidence 必须披露影响与动作
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须为可预期收敛阻塞提供恢复出口
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须验证真实收敛恢复旅程
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须只投射当前成功身份的 evidence 与 effect
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须区分产品观测执行耗时与编排耗时
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: 已解决诊断不得继续作为当前故障
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish checkpoint必须使用轻量CLI bootstrap
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须产品化执行停止边界
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须区分执行计时与检查点等待
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 正式验证必须审计完整候选差异
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须连续执行可机械验证的 provider action
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Retained impact 分类必须覆盖默认 CLI 实现
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 必须传递 retained runtime identity
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。

### Requirement: Task Finish 正常路径必须报告自动化效率证据
**Reason**: 该 requirement 属于 v1 逐 checkpoint、Agent completion、action registry、repair/recovery 或分散计时模型；v2 由固定五阶段执行器、frozen candidate、产品生成恢复和统一结果契约替代。
**Migration**: 当前客户端直接使用唯一 canonical run store；旧 run shape 不可恢复，且不提供兼容 reader、转换或状态迁移。
