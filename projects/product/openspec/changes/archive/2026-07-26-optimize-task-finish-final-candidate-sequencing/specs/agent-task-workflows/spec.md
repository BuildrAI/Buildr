## ADDED Requirements

### Requirement: Task Finish 必须在最终保证前收敛 delivery tree
Task Finish MUST 在调用 selected task-verification provider 执行最终 required assurance 前完成所有当前可预见的 implementation 与 delivery tree 收敛动作，并 MUST 将之后允许发生的动作限制为有独立证据的 closeout-only transition。Delivery convergence MUST 包含适用的 current knowledge 收敛、受管资产完整性、OpenSpec sync compatibility、canonical spec sync、候选提交、目标分支 fetch/rebase 和 tree transition runtime 对齐；不得在明知这些动作尚未完成时把一次 Candidate 表述为最终验证。

#### Scenario: 高风险 Product task 准备最终 Candidate
- **WHEN** Task Finish 为 Buildr Product 解析出 `requiredAssurance: candidate`
- **THEN** Task Finish MUST 先完成适用的 OpenSpec sync、候选提交、目标分支 fetch/rebase、doctor 和 runtime sync
- **AND** MUST 在上述动作收敛且 implementation identity 冻结后才执行最终 Candidate

#### Scenario: 普通任务只要求 affected 保证
- **WHEN** verification provider 返回 `requiredAssurance: affected`
- **THEN** Task Finish MUST 使用同一 delivery convergence 顺序准备最终 implementation identity
- **AND** MUST NOT 因本 Requirement 将普通收尾机械升级为 Candidate

#### Scenario: 最终保证后只发生 closeout-only transition
- **WHEN** 最终 required assurance 已成功且后续只执行最终验证任务 checkbox、已预演的 archive、归档格式收敛、候选提交 amend、目标分支 fast-forward 或 push
- **THEN** Task Finish MUST 为每项动作记录来源、精确 diff、tree-equivalence 与 focused checks
- **AND** 任一无法证明为 closeout-only 的变化 MUST 使旧 evidence 失效

### Requirement: Task Finish 必须在最终保证前预演 OpenSpec archive compatibility
当已完成 active Change 包含 delta specs 时，Task Finish MUST 在真实 canonical sync 和最终 required assurance 前，通过当前 OpenSpec CLI 在隔离 planning copy 中执行 archive rehearsal，以检查场景保全、delta merge、新 capability 建立和 archive compatibility。Rehearsal MUST 是可清理的 workflow check，不得修改真实 Change、canonical specs 或外部 OpenSpec Skill，也不得替代 Buildr pre-sync/post-sync guard。

#### Scenario: Rehearsal 发现场景 identity 风险
- **WHEN** OpenSpec archive rehearsal 报告 MODIFIED Requirement 会遗漏或重命名既有 Scenario
- **THEN** Task Finish MUST 停止真实 sync 和最终 required assurance
- **AND** 修正 delta 后 MUST 重新运行 strict validation、baseline/proposal check 和 pre-sync

#### Scenario: Rehearsal 成功
- **WHEN** 隔离副本完成 archive 且生成的 canonical specs 通过预期检查
- **THEN** Task Finish MUST 记录 OpenSpec version、Change identity、临时 owner、结果摘要和 cleanup 状态
- **AND** 真实 sync 仍 MUST 依次通过 pre-sync、agent-driven sync 与 post-sync

#### Scenario: Change 没有 delta specs
- **WHEN** active Change 不包含 delta specs
- **THEN** Task Finish MAY 跳过 archive rehearsal
- **AND** MUST 记录不适用理由而不是伪造 rehearsal success

### Requirement: Task Finish 必须在最终保证后检测目标分支竞态
Task Finish MUST 在 delivery convergence 阶段记录 fetch/rebase 所使用的目标 ref，并 MUST 在最终 required assurance 成功后、集成前重新读取远端目标 ref。目标 ref 变化时 MUST 返回 convergence 阶段；不得在已验证候选上静默 rebase、force push 或继续复用旧 evidence。

#### Scenario: 目标 ref 保持稳定
- **WHEN** 最终保证后的远端目标 ref 与 convergence observation 一致
- **THEN** Git provider MAY 按既有策略 fast-forward 目标分支并 push
- **AND** Task Finish MUST 核对 delivery tree 与已验证 implementation tree 或允许的 closeout-only delta 一致

#### Scenario: 目标 ref 在 Candidate 后变化
- **WHEN** 最终保证后发现远端目标分支已前进
- **THEN** Task Finish MUST 停止尚未执行的集成与 push，并返回 delivery convergence 执行 fetch/rebase
- **AND** rebase 后 MUST 对新 implementation identity 重新请求相同 required assurance

### Requirement: Task Finish 必须报告验证失效链和重复执行成本
当一次收尾执行多次正式验证时，Task Finish MUST 记录每次 evidence 的候选 identity、run reference、状态、真实 wall-clock、失效或失败原因和替代关系，并 MUST 在最终报告汇总 execute count、Candidate executor count、失效次数与重复验证总耗时。

#### Scenario: Rebase 使成功 Candidate 失效
- **WHEN** 成功 Candidate 后发生改变 implementation identity 的 rebase 或冲突解决
- **THEN** Task Finish MUST 记录 `implementation-changed` 失效事件和原 run 耗时
- **AND** 最终报告 MUST 将新 Candidate 与旧 run 分开，不得只报告最后一轮耗时

#### Scenario: Candidate 失败后修复
- **WHEN** Candidate 失败且修复改变 implementation content
- **THEN** Task Finish MUST 记录失败检查、失败 run 耗时、修复后的新 identity 和替代 run
- **AND** 重跑成功 MUST NOT 隐藏本次收尾已经付出的失败验证成本

#### Scenario: 最终保证一次通过且未失效
- **WHEN** 收尾只执行一次正式验证且后续没有 implementation change
- **THEN** Task Finish MUST 报告 execute count 为一、失效次数为零
- **AND** MUST NOT 为满足格式创建虚构的历史 run
