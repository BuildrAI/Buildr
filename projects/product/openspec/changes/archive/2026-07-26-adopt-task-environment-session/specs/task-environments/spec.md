## ADDED Requirements

### Requirement: Task environment 必须核验 Agent session adoption
Buildr MUST 将 task environment 的 checkout/runtime readiness 与承载任务的 Agent session adoption 分开建模。采用完成前，context MUST 返回 `handoff-required` 或其他非 adopted 状态；只有 session root、environment identity、owner Agent 和 checkout-local runtime source identity 全部匹配时，才 MUST 返回 adopted。

#### Scenario: 新 environment 等待 Agent session handoff
- **WHEN** Buildr 已创建 task environment、准备 checkout-local runtime 且 environment context identity 有效，但尚无匹配的 session adoption evidence
- **THEN** context MUST 返回 environment ready 与 adoption `handoff-required`
- **AND** MUST 提供以 environment root 启动或重新进入 Agent session 的 next action
- **AND** MUST NOT 将命令 `cwd`、runtime 文件存在或 doctor 成功描述为 session 已采用 environment

#### Scenario: 新 session 采用 environment
- **WHEN** Agent/runtime host 提供的 session root 是 environment root，owner、task、adapter 与 runtime source identity 均匹配当前 context
- **THEN** Buildr MUST 写入 Buildr-owned local adoption receipt
- **AND** 后续 context MUST 返回 adoption `adopted`、environment evidence 与 session evidence
- **AND** receipt MUST NOT 写入 Git tracked source 或跨 clone 复用

#### Scenario: session 或 runtime identity 漂移
- **WHEN** adoption 后的 session root、session handle、environment identity、repository plan 或 checkout-local runtime projection identity 不再匹配 receipt
- **THEN** context MUST 返回 `stale` 或 `blocked` 并 fail closed
- **AND** MUST 要求重新 handoff/adopt，而不是仅凭 receipt 文件存在继续任务

### Requirement: Session adoption evidence 必须披露 assurance 边界
Buildr MUST 分别标识由 Buildr 直接核验的 environment/runtime evidence 与由 Agent/runtime host 提供的 session evidence，并 MUST NOT 将后者描述为 Buildr 对 Agent session 的直接内省或密码学认证。

#### Scenario: Agent 提交 host-visible session evidence
- **WHEN** Agent 提交 session root、session handle、adoption mode 与启动或重新进入时间
- **THEN** Buildr MUST 核对其与当前 environment/runtime expectation 一致
- **AND** result MUST 将 environment evidence 标为 `buildr-verified`，将 session evidence 标为 `agent-attested`

#### Scenario: runtime host 不提供必要 session evidence
- **WHEN** 当前 Agent/runtime surface 无法提供 session root、session handle 或对应 adoption event evidence
- **THEN** Buildr MUST 保持 adoption 非 adopted 并列出缺失 evidence
- **AND** MUST NOT 通过读取进程 `cwd`、私有应用状态或手工读取 runtime 文件伪造 adopted 结论

### Requirement: Task environment 清理必须移除本地 adoption state
Buildr MUST 将 adoption receipt 作为 task environment-owned local state 管理，并 MUST 只在 environment 满足既有安全清理前置条件时一并清理；它不得改变 retained checkout 的主 runtime sync 边界。

#### Scenario: 安全集成后清理 environment
- **WHEN** task environment 已安全集成、成员 checkout 可删除且 task-owned resources 已停止
- **THEN** Buildr MUST 随 environment 清理对应 adoption receipt
- **AND** 主 Workspace runtime MUST 仍从 retained checkout sync 并重新 doctor
- **AND** Buildr MUST NOT 从未合并 task checkout 更新原 Workspace runtime
