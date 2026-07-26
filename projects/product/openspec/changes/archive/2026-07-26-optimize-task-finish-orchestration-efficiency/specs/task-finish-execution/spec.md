## ADDED Requirements

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
