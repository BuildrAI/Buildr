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

### Requirement: Finish run必须支持原子identity recovery
Buildr MUST提供版本化identity recovery入口，在同一finish run中一次消费旧/新environment、candidate、target、runtime、change与assurance identities，原子计算失效范围、终结受影响attempt/lease、保留仍有效evidence，并自动推进已登记的确定性步骤。Recovery MUST复用现有step、fingerprint、effect、evidence与safe executor语义，不得建立第二套完成状态。

#### Scenario: Implementation修订改变candidate与checkout-local CLI
- **WHEN** consumer提交可核验的implementation-changed transition及完整新identities
- **THEN** recovery MUST一次计算真正需要重建的最早边界与下游
- **AND** MUST自动推进可安全重建的context、knowledge、convergence、candidate、target与runtime步骤，停在required formal assurance

#### Scenario: Runtime projection only转换
- **WHEN** source/projection digests与允许路径集合证明变化仅为政策允许的`runtime-projection-only`
- **THEN** recovery MUST保留仍与implementation candidate绑定的正式保证
- **AND** MUST记录transition evidence而不是仅接受调用方分类字符串

#### Scenario: 未知或证据不完整的转换
- **WHEN** changed paths、source identity或provider policy不能证明受限transition
- **THEN** recovery MUST按implementation-changed fail closed计算失效
- **AND** MUST NOT复用可能失效的formal assurance

### Requirement: Compact failure必须保留可恢复的结构化诊断
Task Finish compact result MUST从失败observation保留失败step/stage、child result的稳定code/status、bounded findings/nextActions与durable full diagnostic reference。通用process error message MUST NOT替代可解析的child stdout/stderr结果；full detail仍MUST有界且digest绑定。

#### Scenario: Child CLI返回结构化blocked JSON
- **WHEN** safe handler的child process非零退出但stdout包含登记schema的blocked result
- **THEN** compact result MUST显示child code/status、失败stage与next action
- **AND** MUST提供完整diagnostic path/digest而不是只返回`Command failed`

#### Scenario: Child输出不是登记JSON
- **WHEN**child stdout/stderr不能解析为受支持schema
- **THEN**compact result MUST返回bounded preview、byte count、digest和process exit
- **AND** MUST明确标记diagnostic为unstructured

### Requirement: Completion metrics必须声明可观察coverage
Task Finish MUST通过run-local append-only observation ledger汇总Buildr-owned command、safe handler、verification stage与recovery action的start/finish、cwd/command identity、exit、原始stdout/stderr byte count和diagnostic reference。Completion receipt MUST区分产品可观察执行、Agent orchestration gap与外部不可观察调用，并声明`product-complete|product-partial|external-unobserved` coverage；部分计数MUST NOT表述为完整tool round trips或token消耗。

#### Scenario: 全部动作由登记executor执行
- **WHEN**finish run的命令均由Buildr-owned wrapper记录且ledger连续
- **THEN**completion metrics MUST标记`product-complete`
- **AND**MUST返回真实invocation count、output bytes、product wall-clock、queue与retry waste

#### Scenario: Agent在checkpoint间手工执行外部动作
- **WHEN**run只能观察到checkpoint时间而不能观察Agent/tool调用
- **THEN**completion metrics MUST把对应区间标记为unobserved orchestration gap
- **AND**MUST NOT用已记录observation数量冒充全部tool round trips或Agent token

### Requirement: Recovery性能必须进入真实finish benchmark
Buildr MUST提供identity-bound真实finish benchmark，至少覆盖首次成功、candidate修订恢复、formal assurance失败后修复和runtime projection closeout，并报告端到端wall-clock、产品执行、orchestration gap、retry waste、invocation与output metrics coverage。

#### Scenario: 无重试正常路径
- **WHEN**benchmark以固定work class首次通过全部finish步骤
- **THEN**结果 MUST独立报告OpenSpec convergence、formal assurance和其他closeout wall-clock
- **AND**正常路径目标 MUST约为3分钟且不得通过跳过required assurance达成

#### Scenario: Candidate修订后恢复
- **WHEN**benchmark改变implementation candidate并提交typed recovery manifest
- **THEN**结果 MUST报告recovery产品调用次数、重建步骤和到formal assurance的wall-clock
- **AND**MUST证明没有重复已通过且identity未变的副作用

### Requirement: Task Finish 必须在正式保证失败后等待 repair 决策
当正式保证发现实现、契约、测试或历史资产缺陷时，Task Finish MUST 将 run 保持为 blocked 并返回结构化 repair decision；没有绑定当前 task/change、失败 identity 与允许 scope 的明确用户授权时，Task Finish 和 Agent MUST NOT 修改 delivery tree、自动修复缺陷或继续归档、集成、推送与清理。

#### Scenario: 未预授权的正式保证失败
- **WHEN** 用户只授权“收尾”，正式保证对当前 candidate 返回失败
- **THEN** run MUST 停在 formal assurance boundary并报告缺陷、影响、建议修复范围与重新验证成本
- **AND** delivery tree MUST保持不变，后续closeout步骤MUST NOT启动

#### Scenario: 用户授权修复并继续
- **WHEN** 用户在失败前或失败后明确授权当前scope内“修复并继续”
- **THEN** Task Finish MUST记录versioned repair authorization与repair candidate transition
- **AND** 修复后MUST使旧formal evidence失效并执行re-verification
- **AND** 语义冲突、跨任务历史资产修改或授权范围扩大时MUST再次停止请求决定

### Requirement: Task Finish 必须区分 workflow 与 closeout-only timing
Canonical completion receipt MUST保留端到端workflow wall-clock，并 MUST独立记录首次verification、repair、re-verification和closeout-only阶段；closeout-only MUST从最后一个有效正式保证通过后开始，到cleanup complete结束，不得包含验证执行、缺陷诊断、实现修复或重新验证。

#### Scenario: 无缺陷的正常收尾
- **WHEN** 首次正式保证通过并完成资产审查、归档、集成推送、runtime install与cleanup
- **THEN** receipt MUST分别报告verificationMs、closeoutMs与endToEndWallClockMs
- **AND** 不可观察间隔MUST按coverage报告，不得推断为产品执行或token消耗

#### Scenario: 验证失败后修复完成
- **WHEN** 同一finish run包含formal failure、已授权repair、candidate transition和re-verification
- **THEN** receipt MUST分别报告verificationMs、repairMs、reverificationMs、closeoutMs与attributableWasteMs
- **AND** 用户摘要MUST将该过程表述为“验收—修复—重新验收—收尾”，不得把全部wall-clock称为纯收尾耗时

### Requirement: Task Finish compact diagnostic 必须优先暴露真实失败
当Buildr-owned child command以非零状态结束时，compact diagnostic MUST优先返回可解析的failed stage、failed check/test、exit code、bounded findings和repair decision，再附加非阻塞warning；无法结构化解析时 MUST保留digest绑定的完整diagnostic并明确解析缺口，不得仅用warning解释失败。

#### Scenario: 测试失败同时产生预算warning
- **WHEN** formal verification输出一个contract test failure和多个非阻塞budget warnings
- **THEN** compact result的primaryFailure MUST指向contract test failure
- **AND** warnings MUST作为次级字段保留，不得取代failure reason

#### Scenario: 大输出无法完全解析
- **WHEN** child output超过compact上限且没有登记的结构化summary
- **THEN** compact result MUST返回exit code、可确定stage、bounded failure excerpt和diagnostic path/digest
- **AND** MUST标记`structured: false`与明确next action

### Requirement: Task Finish 必须持有版本化 action registry
Buildr MUST 为全部标准 finish step 登记稳定 action entry，并为每个 entry 声明执行种类、适用条件、执行 surface、授权边界、effects、结果契约、evidence projection 与 fallback policy。Registry MUST 是 Task Finish application 的产品事实，不得要求 Agent 从 Skill 文本、cwd、`cliSource` 或历史命令猜测 execution plan。`product-executable` entry MUST 消费 task environment 已核验的结构化 CLI invocation，并将固定参数前缀与动作参数组合为确定 argv。

#### Scenario: 标准步骤均有登记动作
- **WHEN** 产品加载当前 finish plan
- **THEN** 每个 `FINISH_STEPS` identity MUST 至少解析到一个唯一 action entry
- **AND** contract test MUST 在新增 step 未登记时失败

#### Scenario: 登记动作生成执行计划
- **WHEN** 当前 step 匹配 `product-executable` entry 且所需 context 包含 receipt-bound CLI invocation
- **THEN** resolver MUST 使用 invocation 的绝对 command 与固定 args prefix 生成 cwd、argv、effect、assertion、evidence 和 fingerprint
- **AND** 调用方 MUST NOT 需要提供 `--execution-plans`、逐 step fingerprint 或重新推断 CLI 路径

#### Scenario: 历史 caller 仅提供 CLI source
- **WHEN** 迁移期间历史 caller 仍显式提供可执行的绝对 `cliSource`
- **THEN** resolver MAY 将其作为无固定参数前缀的兼容 invocation 使用
- **AND** 标准 task environment consumer MUST 使用 `cliInvocation`，Registry MUST NOT 根据 Workspace root 猜测默认产品路径

### Requirement: Task Finish 必须区分登记 provider 与 Agent 推理 fallback
Registry resolution MUST 区分产品可执行动作、已登记的语义 provider handoff、缺少结构化输入和真正登记外行为。只有不存在唯一登记动作或执行进入登记外语义分支时，Task Finish MUST 返回 `agent-reasoning-required`。

#### Scenario: 标准语义 provider 动作
- **WHEN** 当前 step 的登记种类为 `agent-provider`
- **THEN** result MUST 返回 capability、provider action、所需输入/evidence、执行 surface 与继续方式
- **AND** MUST NOT 把该正常交接描述为命令未知或要求 Agent 猜测 CLI

#### Scenario: Registry 没有覆盖行为
- **WHEN** 当前 step、运行时分支或多个匹配结果无法由 registry 唯一处理
- **THEN** result MUST 返回 `agent-reasoning-required`、原因、当前 identity、已核对 entries 与未执行 effects
- **AND** executor MUST 停在最后成功 checkpoint，不得猜测命令、扩大授权或写入 delivery tree

### Requirement: Task Finish 必须提供 action registry 查询入口
Buildr MUST 提供只读 `buildr task finish actions` 查询；它 MUST 支持列出版本化 registry，并可结合 finish run 返回当前 step resolution、输入缺口、执行 preview 或 provider handoff。查询 MUST NOT 领取 attempt、执行 action 或修改 run。

#### Scenario: 查询当前 run 的下一动作
- **WHEN** consumer 使用 run identity 查询 actions
- **THEN** JSON MUST 返回 registry schema/version、当前 step、resolution status、selected action 与 plan source
- **AND** 查询前后 finish checkpoint MUST 保持一致

### Requirement: Registry 驱动执行必须兼容现有 finish evidence
`task finish run` MUST 优先使用 registry 解析没有显式 plan 的当前 step，并 MUST 复用既有 attempt、lease、fingerprint、observation ledger、diagnostic、recovery 与 completion receipt。显式 caller plan MAY 保留兼容，但输出 MUST 标明 `registry` 或 `caller-supplied` 来源。

#### Scenario: Registry 自动执行连续动作
- **WHEN** 连续当前步骤均为 ready 的 `product-executable` action
- **THEN** executor MUST 自动生成 fingerprint、执行并提交 completion，直到遇到 provider handoff、输入缺口、失败或 Agent reasoning fallback
- **AND** safe execution summary MUST 报告 action id、plan source、实际步骤与 wall-clock

#### Scenario: Caller plan 兼容路径
- **WHEN** 历史 consumer 显式提交有效 execution plan 与 fingerprint
- **THEN** executor MUST 继续按既有安全约束执行
- **AND** evidence MUST 标记 plan source 为 `caller-supplied`，不得冒充 registry coverage
