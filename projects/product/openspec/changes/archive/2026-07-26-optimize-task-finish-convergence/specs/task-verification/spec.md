## MODIFIED Requirements

### Requirement: 验证能力返回并报告标准结果证据
Task verification provider MUST 返回 `requiredAssurance`、验证级别、状态、policy sources、policy mode、候选 identity、检查结果、能力选择决策、覆盖与环境摘要、授权决策、Candidate 完整性、整体耗时、timing source、最慢检查、失败项、跳过项、evidence reference 和 evidence 生命周期，并 MUST 在直接验证或开发完成回复中以“受影响验证”或“完整候选验证”作为主要用户表述。provider MUST 区分自身 `execute` 的验证 wall-clock 与 consumer 的 workflow check、同步诊断或 Git 操作；后者不得进入 verification totalDurationMs。

#### Scenario: 受影响验证成功
- **WHEN** 普通任务的 affected 验证成功并产生与当前候选一致的 evidence
- **THEN** provider MUST 报告受影响范围、实际能力、总耗时、失败项、跳过项和 evidence reference
- **AND** provider MUST 明确该证据满足普通交付保证，但不把它描述为完整 Candidate

#### Scenario: 最终候选验证成功
- **WHEN** Candidate 验证成功并产生可信 evidence
- **THEN** provider MUST 报告候选、完整验证、选中能力、Candidate 完整性、总耗时、最慢检查、失败项为无、跳过项和 evidence reference
- **AND** provider MUST 只有在 `candidateCompleteness: confirmed` 时说明实现具备完整候选证据

#### Scenario: Consumer workflow check 不计入验证时间
- **WHEN** consumer 在 execute 前后运行 OpenSpec guard、doctor、Git fetch 或 archive rehearsal
- **THEN** provider MUST 只记录自身 verification execution 的 wall-clock
- **AND** result evidence MUST 使 consumer 能将其他步骤另行归因

#### Scenario: 能力因环境或授权未运行
- **WHEN** 某个适用能力因环境未就绪、副作用未知或缺少授权被跳过或阻塞
- **THEN** provider MUST 记录能力 id 与原因
- **AND** 所需保证中的 required gate 未执行时 status MUST NOT 为通过

#### Scenario: 验证失败
- **WHEN** 任一必要检查失败
- **THEN** provider MUST 报告失败状态、失败检查、退出状态、已完成检查、实际总耗时和 evidence reference
- **AND** provider MUST NOT 将任务描述为满足所需保证
