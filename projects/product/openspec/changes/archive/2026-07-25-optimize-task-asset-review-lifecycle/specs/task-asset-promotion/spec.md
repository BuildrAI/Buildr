## MODIFIED Requirements

### Requirement: 审查输出区分执行质量反馈和资产建议
Agent MUST 区分对本次任务执行质量的反馈、没有合格候选的 `discarded` 终态与需要人工决定的长期资产建议。

#### Scenario: 显式任务复盘
- **WHEN** 用户明确要求复盘任务执行
- **THEN** Agent MUST 输出简短执行轮廓、主要质量发现及其证据
- **AND** 只有通过沉淀门槛且尚未被当前任务完整解决的发现 MUST 进入独立资产建议部分

#### Scenario: Task Finish 审查没有候选
- **WHEN** selected provider 完成覆盖核验但没有合格且未解决的候选
- **THEN** provider MUST 返回 `discarded` 并精确删除 observation
- **AND** Task Finish MUST 继续收尾，不得要求人工接受空候选或已完成修改

#### Scenario: Task Finish 审查存在候选
- **WHEN** selected provider 返回 `awaiting-human`
- **THEN** Task Finish MUST 在 cleanup 前等待用户 accept 或 reject
- **AND** 最终报告 MUST 区分本次执行质量反馈与后续独立任务候选

### Requirement: 写入前必须取得用户确认
Agent MUST 在当前任务结束时向用户提交合格候选并取得 accept 或 reject；accept 只授权创建新的维护任务，不授权在原任务写入目标资产，且 handoff MUST 使用不同于来源任务的 identity。

#### Scenario: 用户接受候选
- **WHEN** 用户明确接受一个候选
- **THEN** Agent MUST 保存包含来源任务、独立目标任务、候选类型和目标资产或 change 的 handoff
- **AND** 后续 MUST 重新进入 `task-triage`，原任务 MUST 保持结束

#### Scenario: 用户拒绝候选
- **WHEN** 用户拒绝 awaiting-human 候选
- **THEN** Agent MUST 删除 observation
- **AND** 未确认内容 MUST NOT 形成 Git history

### Requirement: 确认后的写回使用现有生命周期
用户接受候选后，Agent MUST 在新的 task-triage 环境中使用目标资产的维护、授权和验证流程，并 MUST 按候选类型提供可核验的完成证据后再删除 observation。

#### Scenario: 新任务写入资产
- **WHEN** 新任务实际修改 Rule、Skill 或 capability Contract
- **THEN** Agent MUST 同时维护对应 tracked asset-maintenance record
- **AND** 只有 maintenance record 与资产变更已提交并集成到目标远端 ref 后才能以 `asset-integrated` 完成 observation

#### Scenario: Product follow-up 写入 OpenSpec
- **WHEN** 新任务为 product follow-up 创建或更新 OpenSpec change
- **THEN** proposal 或 design MUST 吸收 observation 的必要来源事实
- **AND** 只有 change identity 与 artifact 路径可核验后才能以 `product-absorbed` 完成 observation

#### Scenario: 新任务未形成资产修改
- **WHEN** 新任务核验后不修改资产
- **THEN** Agent MUST 以独立任务 identity、核验结论和稳定证据引用完成 `no-change`
- **AND** provider MUST 删除 observation 且不保留 tracked 维护日志
