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
