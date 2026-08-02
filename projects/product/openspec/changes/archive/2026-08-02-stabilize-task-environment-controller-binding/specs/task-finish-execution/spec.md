## MODIFIED Requirements

### Requirement: Cleanup 必须由 retained checkout 完成真实收尾
`cleanup` MUST 由 retained finalizer 先写 durable Finish completion/delivery facts，再通过 canonical retained Workspace 的可信、source-clean Environment Manager 向 selected `buildr.task-environment/v1` provider 提交每个工作范围的 delivery identity 与 cleanup eligibility。Task Environment MUST 独占资源停止、provider cleanup、共享根解除占用和 Environment cleanup result；Task Finish MUST 只记录 handoff/result summary，MUST NOT 比较或更新 Receipt controller content fingerprint，也 MUST NOT 直接扫描资源、调用 worktree cleanup、删除 branch/checkout 或写第二份环境结论。

#### Scenario: 资源可安全清理
- **WHEN** frozen candidate 已交付、Finish completion durable，且 Environment 复核全部 Task-owned 资源/provider evidence 可安全处置
- **THEN** Task Environment MUST 停止动态资源、调用适用 provider cleanup 并返回 removed/retained evidence
- **AND** Finish cleanup stage MUST 记录 Environment result reference/status 后完成 run

#### Scenario: retained manager 在交付后已升级
- **WHEN** Finish completion/delivery facts 与 Task-owned resource/provider evidence 匹配，当前 retained Environment Manager clean/可信，但 content identity 与 Receipt 创建指纹不同
- **THEN** cleanup MUST 继续消费既有 delivery handoff并按当前资源/provider facts执行
- **AND** Finish prepare/recovery input identity MUST NOT 纳入 Receipt controller content fingerprint
- **AND** MUST NOT 自动改写 controller identity、创建 generation transition 或重跑 prepare/verify/deliver

#### Scenario: Task-owned 资源仍在运行或无法证明
- **WHEN** Environment cleanup 观察到 matching preview/runtime 未停止、provider identity 不匹配、shared root ownership 不明或其他 Task 仍占用资源
- **THEN** Environment MUST 返回 resumable `blocked` 并保留现场
- **AND** Finish MUST 只保留 cleanup resume point，不得重跑 prepare、verify、deliver 或自行终止/删除资源

#### Scenario: Finish 尝试直接调用 Git provider
- **WHEN** Finish cleanup path 绕过 Task Environment 请求 `worktree cleanup`、删除 branch/checkout 或解释 provider evidence
- **THEN** product verification MUST fail 并指出越过 Environment authority 的调用路径
- **AND** Git provider MUST 只接受 Task Environment 提供的 matching cleanup handoff

#### Scenario: Environment 已清理但 Finish 尚未完成
- **WHEN** Environment Receipt 已记录 matching complete cleanup，而 Finish run 因 retained metadata 写入等后续暂态条件中断
- **THEN** resume MUST 复用同一 Environment result，不得再次停止资源或调用 provider cleanup
- **AND** Finish MUST 只完成自己尚未持久化的 result/completion 动作
