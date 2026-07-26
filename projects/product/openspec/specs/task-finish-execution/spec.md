# task-finish-execution Specification

## Purpose

定义 Task Finish 如何把一个逻辑任务的收尾持久化为可检查、可恢复、可精确失效且支持并发资源协调的独立执行 run。

## Requirements

### Requirement: Task Finish 使用独立持久化 run 渐进执行
Buildr MUST 为每次逻辑任务收尾建立独立 finish run，并为每一步持久化 `pending|running|passed|blocked|stale`、输入 fingerprint、effects、evidence、invalidation dependencies 与 retry policy。run MUST 绑定 task/change identity，但 MUST NOT 绑定单个 Agent session。

#### Scenario: 可选执行载体继续同一逻辑任务
- **WHEN** Agent 选择后台 session 或 subagent 执行某个 finish action
- **THEN** 新执行载体 MUST 继续相同 task、change 和 finish run identity
- **AND** 该载体 MUST NOT 成为 task environment 成立或 `executionReady` 的必要条件

#### Scenario: 检查 checkpoint
- **WHEN** consumer 调用 `buildr task finish inspect`
- **THEN** 结果 MUST 返回当前步骤、已完成 effects、有效 evidence、阻塞原因、stale steps 和 next action
- **AND** inspect MUST NOT 改变 run 或取得 lease

### Requirement: Finish run 只恢复失效或阻塞的下游
Buildr MUST 通过显式依赖和 fingerprint 精确传播失效；resume MUST 保留输入未变的 passed 步骤，只重试 blocked/stale 及其下游。

#### Scenario: push 成功而 cleanup 失败
- **WHEN** push 步骤已 passed 且 cleanup blocked
- **THEN** resume MUST 从 cleanup 继续
- **AND** MUST NOT 重复 push、integration 或 formal assurance

#### Scenario: rebase 改变最终树
- **WHEN** target convergence 改变 formal assurance 的输入 fingerprint
- **THEN** formal assurance 及其下游 MUST 标记 stale
- **AND** 更早且输入未变的 OpenSpec/current-knowledge 步骤 MUST 保持 passed

#### Scenario: 重复提交同一步成功结果
- **WHEN** consumer 使用相同 attempt、fingerprint 和 effect identity 再次提交 passed
- **THEN** Buildr MUST 返回现有 checkpoint
- **AND** MUST NOT 重复记录副作用

### Requirement: 正式验证发生在 delivery convergence 之后
Finish plan MUST 将正式 affected 或 Candidate assurance 放在 canonical/runtime/target convergence 后，并将最终树 identity 纳入输入 fingerprint。required assurance 仍由 selected task-verification provider 决定。

#### Scenario: 普通任务要求 affected
- **WHEN** selected provider 返回 `requiredAssurance: affected`
- **THEN** finish run MUST 执行 affected step 而非机械升级 Candidate
- **AND** 该 step MUST 绑定 convergence 后的最终树 identity

### Requirement: 并发 finish run 只锁定共享资源
Buildr MUST 允许多个 finish run 独立推进且 MUST NOT 使用 Workspace 全局锁。只有 target branch、canonical checkout、runtime sync、默认 Local App/CLI install 等共享资源步骤 MAY 使用短 lease；远端 ref MUST 使用乐观并发 observation。

#### Scenario: 两个不共享资源的 run 并发
- **WHEN** 两个 run 的当前步骤没有相同 shared resource
- **THEN** 两者 MUST 都能进入 running

#### Scenario: 共享 target branch
- **WHEN** 一个 run 已持有未过期的 target branch lease
- **THEN** 另一个 run MUST 返回 blocked 和 lease owner/expiry
- **AND** MUST NOT 改写第一个 run 的 checkpoint

#### Scenario: 远端 ref 在验证后前进
- **WHEN** 集成前观测到 target ref 不等于 convergence 时保存的 expected value
- **THEN** run MUST 以 `target-race` 阻塞并使 target convergence 下游 stale
- **AND** MUST NOT push 或 force push

### Requirement: CLI 提供 inspect advance resume
Buildr MUST 提供 `buildr task finish inspect|advance|resume`。`advance` MUST 创建或推进 run，`resume` MUST 先恢复 blocked/stale 边界再推进，所有写操作 MUST 原子持久化并返回 machine-readable result evidence。

#### Scenario: advance 领取下一动作
- **WHEN** 当前步骤为 pending 且其依赖均 passed
- **THEN** advance MUST 将其标记 running 并返回 attempt token、输入 fingerprint、action 和 retry policy

#### Scenario: blocked 后 resume
- **WHEN** 当前步骤 blocked 且 consumer 提供了新的有效输入 fingerprint
- **THEN** resume MUST 将该步骤及需要重算的下游恢复为可执行状态
- **AND** MUST 保留已完成 effects 历史

### Requirement: Finish run identity 必须限制在 canonical state root
Buildr MUST 验证 finish run id 并保证全部 run 读写路径位于当前 Workspace 的 `.buildr/task-finish/runs/` 内。

#### Scenario: run id 包含路径逃逸字符
- **WHEN** consumer 使用包含路径分隔、`..` 或不受支持字符的 run id
- **THEN** Buildr MUST 在任何文件读写前拒绝该请求
- **AND** MUST NOT 在 canonical runs root 之外创建或覆盖文件

### Requirement: Finish step completion 必须携带最小可信证据
Buildr MUST 只接受与当前 running attempt、input fingerprint 和结构化 evidence 匹配的 step completion；`integration-push` MUST 另外提交匹配的 expected/observed target ref observation。

#### Scenario: step 缺少 fingerprint 或 evidence
- **WHEN** consumer 提交 `passed` 但没有非空 input fingerprint 或稳定 evidence identity
- **THEN** Buildr MUST 拒绝 completion 并保持该 attempt 未通过
- **AND** MUST NOT 记录 effects 或释放共享 lease

#### Scenario: integration push 缺少远端 observation
- **WHEN** consumer 为 `integration-push` 提交 `passed`，但缺少 expected 或 observed target ref
- **THEN** Buildr MUST 拒绝 completion
- **AND** MUST NOT 把传输动作记录为成功

#### Scenario: 重复提交成功结果
- **WHEN** consumer 重复提交相同 attempt、fingerprint、effect identities 和 evidence identities
- **THEN** Buildr MUST 返回现有 checkpoint
- **AND** MUST NOT 重复记录副作用

### Requirement: Shared lease 必须使用 fencing identity
Buildr MUST 用 lease key、run、step 和 attempt token 共同标识共享资源 owner，并 MUST 在 completion、release 和 expired takeover 时核对当前 lease identity。

#### Scenario: 旧 holder 在 lease 被接管后完成
- **WHEN**旧 lease 已过期且另一 run 已接管资源，原 holder 随后提交 completion
- **THEN** Buildr MUST 返回 `lease-lost` 或等价 blocked 结果
- **AND** MUST NOT 删除新 holder 的 lease 或接受原 holder 的成功结果

#### Scenario: lease 在动作执行期间过期
- **WHEN** holder 提交 completion 时当前 lease 已过期且未被同一 attempt 有效持有
- **THEN** Buildr MUST fail closed 并要求重新领取或恢复该步骤
- **AND** 已 passed 的无关上游步骤 MUST 保持不变

### Requirement: Finish step 执行计划必须可预检
Buildr Task Finish MUST 支持为 step 提交结构化 execution plan，并在动作开始前核对 command entry、cwd、参数与已声明 script 或 selector。规范化计划 MUST 完整保留 completion 重新验证所需的 selector declaration，并纳入 step input fingerprint 和 evidence；第一阶段预检 MUST NOT 被表述为 Buildr 已代替 Agent 执行 provider action。

#### Scenario: npm script 不存在
- **WHEN** execution plan 指向当前 package manifest 未声明的 npm script
- **THEN** Task Finish MUST 在动作执行前返回结构化 blocked 结果
- **AND** MUST 报告 package root、script 和可用入口，而不是启动失败命令

#### Scenario: cwd 或 executable 越界
- **WHEN** execution plan 的 cwd 不在 task environment allowed execution roots 内，或 executable identity 与 receipt 不匹配
- **THEN** Task Finish MUST fail closed
- **AND** MUST NOT 领取该动作的共享资源 lease

#### Scenario: verification selector plan 完成时重放
- **WHEN** step 以已声明 `availableSelectors` 中的 selector 领取并持久化规范化 execution plan
- **THEN** completion MUST 使用同一持久化 declaration 成功重新验证 selector
- **AND** MUST NOT 因规范化过程丢失 `availableSelectors` 而误报 selector 未声明

### Requirement: Shared lease 必须支持受 fencing 约束的续租
Task Finish MUST 允许当前 holder 在 lease 未过期时使用相同 run、step、attempt 与 token 显式续租。renew MUST NOT 复活过期 lease、覆盖接管者或改变 fencing identity，并 MUST 记录 renewal evidence。

#### Scenario: 当前 holder 续租
- **WHEN** 当前 attempt 在 lease 到期前提交匹配 identity 的 renew
- **THEN** Task Finish MUST 原子延长 expiry 并保留相同 fencing token
- **AND** inspect MUST 返回更新后的 expiry 与 renewal count

#### Scenario: 过期 holder 请求续租
- **WHEN** lease 已过期或已由另一 attempt 接管
- **THEN** Task Finish MUST 返回 `lease-expired` 或 `lease-lost`
- **AND** MUST NOT 修改当前 lease owner

### Requirement: Finish run 必须报告完整阶段和重试耗时
Task Finish MUST 持久化每次 attempt 的 start、finish、duration、outcome 与 retry attribution，并汇总 happy-path wall-clock、workflow check、formal assurance、blocked/retry 和 attributable waste。不同命令或并行检查耗时 MUST NOT 相加冒充 wall-clock。

#### Scenario: step 阻塞后恢复
- **WHEN** 一个 step 阻塞、修复后以新 attempt 成功
- **THEN** inspect MUST 同时保留失败 attempt 与成功 attempt timing
- **AND** MUST 将失败 attempt 标记为 retry/waste，而不是覆盖历史

#### Scenario: 正常路径没有重试
- **WHEN** 所有 step 第一次 attempt 均通过
- **THEN** timing summary MUST 报告 retry count 为零且 attributable waste 为零
- **AND** MUST 返回 run 的真实 wall-clock

### Requirement: Finish run 必须支持晚期资产审查
当首次 asset review finalize 后 archive、integration 或 cleanup 产生新的 observation revision 时，Task Finish MUST 在清理 observation 前重新调用 selected asset-review provider。没有新 revision 时 MUST 确定性跳过 late finalize。

#### Scenario: archive 暴露新长期信号
- **WHEN** archive 阶段写入了晚于首次 finalize 的 observation revision
- **THEN** finish run MUST 在 cleanup 前执行 late asset review
- **AND** provider 返回 `awaiting-human` 时 MUST 保留 environment 并等待决定

#### Scenario: 没有晚期信号
- **WHEN** 首次 finalize 后 observation revision 未变化
- **THEN** finish run MUST 跳过重复资格审查
- **AND** MUST 记录 `not-applicable` evidence

### Requirement: Finish run 必须支持安全自动执行
Buildr MUST 提供 safe execution 入口，在同一持久化 finish run 上自动推进已登记、可预检且授权边界确定的步骤。执行器 MUST 复用现有 attempt、fingerprint、lease、evidence 和 invalidation 语义，不得建立第二套完成状态。

#### Scenario: 正常路径自动推进
- **WHEN** 当前及后续步骤都有匹配的 safe handler、有效 execution binding 和所需授权
- **THEN** executor MUST 依次执行动作并提交结构化 completion，直到完成或到达非自动步骤
- **AND** result MUST 报告实际执行步骤、effects、evidence 和 wall-clock

#### Scenario: 遇到不安全或失败步骤
- **WHEN** handler 未登记、预检失败、identity 漂移、授权不足或动作失败
- **THEN** executor MUST 停止在当前 checkpoint 并返回 blocked/next action
- **AND** MUST NOT 重复已 passed effects 或自动扩大授权

#### Scenario: 并行只读 observation
- **WHEN** 同一步包含多个无依赖且无写副作用的 observation
- **THEN** executor MAY 并行执行这些 observation
- **AND** shared writes MUST 继续受现有 lease 与 fencing 约束

### Requirement: Finish run 必须支持 identity-bound 多阶段编排
Task Finish MUST 允许已登记 composite handler 在同一持久化 run 内推进多个有序子阶段，并 MUST 为每个子阶段记录 identity、outcome、duration 与失败边界。Composite success MUST 由各阶段契约共同决定，不得由单个进程退出码或调用方自证替代。

#### Scenario: OpenSpec convergence 正常完成
- **WHEN** rehearsal、pre-sync、canonical sync 和 post-sync 的 change、digest 与 executable identity 全部一致且通过
- **THEN** handler MUST 连续推进同一 convergence attempt并持久化各阶段 evidence
- **AND** Agent MUST NOT 手工创建或搬运 convergence receipt 才能继续

#### Scenario: 中间阶段出现语义冲突
- **WHEN** compatibility scan、guard 或 canonical sync发现需要语义判断的冲突
- **THEN** handler MUST 停止在最后成功阶段并返回 actionable blocked result
- **AND** MUST NOT 跳过阶段、刷新事后基线或把整个 composite 标记 passed

### Requirement: Integration push 必须表达完整 ref transition
Task Finish MUST 区分 push 前期望与实际 observation、push 后期望与实际 observation，并由同一 Git action evidence绑定 candidate identity。系统 MUST 只把 push 前外部漂移判为 `target-race`，不得把当前 run 自身成功更新 target ref 判为竞态。

#### Scenario: 当前 run 成功推进目标 ref
- **WHEN** observed before 等于 expected before，push 后 observed ref 等于 candidate 与 expected after
- **THEN** integration push MUST passed并记录完整 ref transition
- **AND** MUST NOT 使 formal assurance 或其他下游 evidence stale

#### Scenario: 远端已等于当前 candidate
- **WHEN** push 前 observed ref 已等于 candidate且 candidate content identity匹配
- **THEN** handler MUST 将动作视为幂等成功而不重复 push
- **AND** MUST 保留远端已收敛 evidence

#### Scenario: 外部更新目标 ref
- **WHEN** push 前 observed ref 不等于 convergence 保存的 expected before且也不等于当前 candidate
- **THEN** run MUST 以 `target-race` 阻塞并停止 push
- **AND** 只按真实 candidate变化范围失效下游 evidence

### Requirement: Invalidation 必须原子终结 attempt 与 lease
当 step 变为 stale、blocked 或被恢复时，Task Finish MUST 原子更新 attempt outcome、finishedAt、duration 和 lease ownership。Complete run MUST NOT 包含 running attempt、未释放 task-owned lease 或未处理 stale/blocked step。

#### Scenario: running step 被上游 invalidation
- **WHEN** 上游 input变化使当前 running step stale
- **THEN** 状态机 MUST 终结该 attempt并释放仍由它持有的 lease
- **AND** resume MUST 能由同一 run重新领取而不被自身残留 lease阻塞

#### Scenario: run 准备完成
- **WHEN** cleanup completion将使 run进入 complete
- **THEN** 状态机 MUST 核对没有未结束 attempt、残留 lease或未处理 step
- **AND** 任一不变量失败时 MUST 保持 blocked并返回精确修复动作

### Requirement: Cleanup completion 必须绑定真实删除与 durable receipt
Task Finish MUST 区分 cleanup readiness 与 completion。只有 task-owned process、environment、branch和 transient evidence 的授权动作已实际完成或明确保留后，cleanup才能 passed；删除 task environment 前 MUST 在 canonical Workspace 保存 durable completion receipt。

#### Scenario: environment 删除失败
- **WHEN** worktree、branch或 task-owned process cleanup失败
- **THEN** cleanup MUST 保持 blocked并保留已完成远端 effects
- **AND** run MUST NOT 预先标记 complete

#### Scenario: environment 即将删除
- **WHEN** cleanup前置条件满足且 environment-local run state将随 checkout删除
- **THEN** Task Finish MUST 先持久化 canonical completion receipt再执行删除
- **AND** receipt MUST 包含最终 refs、验证、archive、cleanup、timing和诊断引用

### Requirement: Finish CLI 默认返回 compact progress evidence
Task Finish CLI MUST 为正常 `run|advance|resume` 返回可机器解析的 checkpoint delta、next action、blocked 与 timing summary，并 MUST 提供显式 full detail诊断。Compact输出 MUST 保留安全判断所需 identity，不得通过省略失败细节降低可审计性。

#### Scenario: 正常步骤通过
- **WHEN** safe executor连续完成一个或多个步骤且没有失败
- **THEN** 默认输出 MUST 聚合本轮 executed steps、关键 effects、duration和 next action
- **AND** MUST NOT 重复输出全部历史 steps、attempts和逐资产成功项

#### Scenario: 调用方请求完整诊断
- **WHEN** consumer显式请求 full detail或步骤失败
- **THEN** CLI MUST 返回或引用完整 attempts、leases、evidence和 actionable findings
- **AND** compact与full结果 MUST 共享同一 run identity和状态事实

### Requirement: Finish timing 必须区分执行与编排成本
Task Finish MUST 报告 command execution、provider orchestration、Agent/tool round trip、blocked recovery、attributable waste和端到端 wall-clock的可用计时边界。Attempt duration MUST 覆盖对应 provider动作的真实执行窗口，不得只记录领取或提交 evidence的时间。

#### Scenario: Formal verification由provider执行
- **WHEN** formal-assurance attempt启动 required capabilities并在完成后提交 summary
- **THEN** attempt start/finish MUST 包围真实 verifier execution
- **AND** timing MUST 使用跨平台单调时钟而非调用方手写 duration

### Requirement: Task Finish必须消费产品持有的convergence orchestrator
Task Finish MUST通过产品application service推进archive rehearsal、pre-sync guard、deterministic plan/apply、strict validation与post-sync guard，并持久化每个阶段的identity、timing和恢复边界。正常safe路径MUST NOT要求Agent读取delta、直接编辑canonical文件或手工搬运receipt。

#### Scenario: Safe convergence一次推进
- **WHEN**deterministic plan全部safe/already-applied且各阶段identity匹配
- **THEN**Task Finish executor MUST在同一convergence attempt内完成全部阶段
- **AND**checkpoint MUST记录阶段摘要与最终receipt

#### Scenario: Planner要求语义处理
- **WHEN**orchestrator返回`semantic-resolution-required`
- **THEN**run MUST保持contract-convergence blocked并指向Agent fallback
- **AND**resume MUST从真实失效阶段继续而不重复passed rehearsal/guard effects

### Requirement: Finish入口必须解析权威execution roots
Task Finish MUST从明确Workspace target、Project selector、task environment receipt和repository membership解析Workspace、Product、Service与command cwd。调用方相对路径或当前shell cwd MUST NOT替代这些authority。

#### Scenario: 从Service目录调用Workspace动作
- **WHEN**consumer在allowed Service cwd调用finish且提供Workspace target与Project context
- **THEN**系统 MUST解析同一canonical finish run与正确Product/Service roots
- **AND**MUST NOT因调用方少退或多退目录而创建嵌套Workspace状态

#### Scenario: Root无法唯一解析
- **WHEN**target、Project registry、membership或receipt identity不一致
- **THEN**系统 MUST在文件写入或命令启动前blocked
- **AND**result MUST返回resolved candidates与唯一修复动作

### Requirement: Completion receipt必须持久化完整效率证据
Canonical completion receipt MUST包含run created/completed time、端到端wall-clock、各step/attempt execution timing、retry count、blocked recovery、attributable waste、formal verification timing、tool round-trip计数和输出量近似指标。删除task environment后这些证据MUST仍可访问。

#### Scenario: Environment删除后审查效率
- **WHEN**cleanup finalize已删除task environment
- **THEN**canonical receipt MUST允许consumer重建关键阶段耗时与重试来源
- **AND**MUST NOT只保留formal verification单项duration

### Requirement: Full detail必须使用有界诊断引用
正常compact result MUST仅内联当前状态、阶段摘要、失败项与timing totals；完整attempts、command previews和测试输出MUST写入run-owned diagnostics并返回稳定digest/path，除非调用方明确读取该引用。

#### Scenario: Consumer请求full detail
- **WHEN**历史steps、attempts或command output超过内联预算
- **THEN**CLI MUST返回诊断引用与有界preview
- **AND**MUST NOT把全部历史重复注入主JSON响应

### Requirement: Finish benchmark必须测量执行与Agent编排
Buildr MUST提供真实finish benchmark evidence，分别记录产品命令执行、provider/composite execution、Agent/tool round-trip、blocked recovery、输出字节或Token近似量和端到端wall-clock。

#### Scenario: 比较连续两轮finish
- **WHEN**同类普通Change完成真实收尾
- **THEN**结果 MUST能比较formal verification、OpenSpec convergence、Git/runtime/cleanup与Agent编排成本
- **AND**MUST明确披露未被产品自动化的阶段
