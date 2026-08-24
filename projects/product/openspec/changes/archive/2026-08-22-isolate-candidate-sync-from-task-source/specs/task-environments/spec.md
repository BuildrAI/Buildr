## MODIFIED Requirements

### Requirement: Task Validation Workspace 必须隔离候选 runtime 投射
Task Environment MUST 允许候选 Rule、Skill、contract、CLI 和 runtime 只投射到 receipt 绑定的任务验证工作区（Task Validation Workspace），并 MUST 使用不执行 Workspace Structured Store migration、Project registry migration、package builtin/Component source sync 的 projection-only 操作准备候选 runtime。Task Environment MUST 在写入前阻止候选 source 更新 retained Workspace、另一个 task worktree 或验证根之外的共享用户 runtime。Environment Receipt MUST 记录 runtime source/projection identity 与 projection probe，但 MUST NOT 保存或声称真实 Agent session adoption evidence。

#### Scenario: 候选投射自身任务验证工作区
- **WHEN** Buildr 自举候选从 task checkout 向同一 receipt 登记的验证工作区准备 runtime
- **THEN** 产品 MUST 只投射 workspace-scoped Rule、workspace Skill 与产品入口 Buildr Skill，并允许验证根内隔离模拟 user destination
- **AND** MUST NOT 执行 Workspace source sync、Structured Store migration 或 Project registry migration
- **AND** Environment Receipt MUST 更新 source/projection identity 与 projection ready 事实

#### Scenario: 候选尝试更新 retained runtime
- **WHEN** candidate source 把 retained Workspace、peer task worktree 或验证根外共享 user runtime 作为投射目标
- **THEN** 产品 MUST 在任何写入前 fail closed
- **AND** MUST 报告 candidate source、允许验证根与越界 target

#### Scenario: projection 已就绪但 session 未证明
- **WHEN** runtime 文件与 projection identity 已通过检查，但没有真实 Agent host/session evidence
- **THEN** Environment `ready` MAY 保持有效并报告 session consumption unknown/not-applicable
- **AND** MUST NOT 创建 adoption receipt、要求普通 workflow 新开 session 或把 projection 冒充为实际采用

#### Scenario: 专项验收需要 Agent session
- **WHEN** 变更影响 Agent runtime discovery/loading/activation 且 P0.4 验收明确要求 session proof
- **THEN** Task Environment MUST 只向 Task Verification 提供 environment/source/projection identity
- **AND** 实际 session evidence 与结论 MUST 由 Verification Result 持有，不得写回 Environment Receipt
