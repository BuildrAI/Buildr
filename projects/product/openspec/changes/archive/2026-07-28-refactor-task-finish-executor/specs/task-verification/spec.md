## MODIFIED Requirements

### Requirement: 验证在完成节点自动触发
Task verification provider MUST 同时支持用户直接验证意图、实现/审查 workflow 的完成节点和 Task Finish 对 frozen candidate 的最终保证，且 MUST NOT 要求用户主动说出 Skill、capability 或内部验证级别名称。实现、审查与前序测试验证 MUST 在进入 Task Finish 前形成 finish-ready candidate；Task Finish MAY 复用完全匹配 evidence 或至多执行一次 required assurance，但任何失败 MUST 终止当前 Finish 并回到研发流程，MUST NOT 在同一 Finish run 中 repair 或 re-verify。

#### Scenario: 用户直接要求验证
- **WHEN** 用户要求运行测试、验证改动、判断验证是否完成或报告验证耗时
- **THEN** Agent runtime MUST 能根据 provider description 发现 task-verification 入口
- **AND** provider MUST 按当前任务阶段和 Project policy 执行最低充分验证

#### Scenario: Agent 准备提交 finish-ready candidate
- **WHEN** 实现内容、审查修订和前序测试已经稳定，Agent 准备进入 Task Finish
- **THEN** Agent MUST 先确认当前候选没有已知产品缺陷且验证 evidence 与候选一致
- **AND** 未完成的研发、审查、测试补齐或修复 MUST 留在研发 workflow，不得转交 Task Finish 处理

#### Scenario: Task Finish 复用匹配 evidence
- **WHEN** frozen candidate 已有 selected task-verification provider 产生的成功 evidence，且 policy、required assurance 和 candidate identity 完整匹配
- **THEN** Task Finish MUST 复用该 evidence并记录正式 executor invocation 为 0
- **AND** provider inspection MUST NOT 被计为 verification execution

#### Scenario: Task Finish 执行最终保证
- **WHEN** frozen candidate 缺少可复用 evidence，但其他 preflight/prepare 门禁均证明候选 finish-ready
- **THEN** Task Finish MUST 对 frozen candidate 至多执行一次 required assurance
- **AND** 成功 evidence MUST 绑定 freeze identity，任何 candidate 变化 MUST 使当前 Finish terminal failed

#### Scenario: Task Finish 最终保证失败
- **WHEN** 最终 required assurance 返回 failed、incomplete 或发现产品缺陷
- **THEN** provider MUST 返回具体 failed check/stage、failure identity、diagnostic 和 verifier wall-clock
- **AND** Task Finish MUST 返回 `upstream-candidate-defect` 与 `task-development` handoff，不得请求 repair authorization、同 run recovery 或 re-verification

#### Scenario: 修复后重新验证
- **WHEN** 研发 workflow 根据上一 Finish failure 完成修复、审查和测试
- **THEN** provider MUST 将修改后的内容视为新的 candidate，并重新建立相应验证 evidence
- **AND** 新 verification timing MUST 属于研发流程，不得累计到上一 Finish run 的 wall-clock 或 formal execution count
