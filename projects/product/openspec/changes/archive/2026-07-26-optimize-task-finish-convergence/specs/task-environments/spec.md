## MODIFIED Requirements

### Requirement: Task environment 必须核验 execution binding
Buildr MUST 以 environment receipt、repository membership/identity、allowed execution roots、checkout-local CLI/runtime projection identity 和明确 target/workdir 判断 `executionReady`。Agent session root MUST NOT 是普通 proposal、implementation、verification 或 finish 的必要条件，也 MUST NOT 被要求等于 environment root。

#### Scenario: canonical workspace 对话操作 task environment
- **WHEN** Agent session 从 canonical Workspace 启动，但命令使用 task environment 的明确 target、成员 checkout workdir 和 checkout-local CLI
- **THEN** context MUST 在 environment 与 repository identity 匹配时返回 `executionReady: true`
- **AND** canonical Workspace 中已加载的能力 MUST NOT 因 session root 不同而失效

#### Scenario: 请求路径或 CLI 越界
- **WHEN** target/workdir 不属于 allowed execution roots，或 CLI/runtime projection identity 不属于该 environment
- **THEN** context MUST 返回 blocked 并 fail closed
- **AND** MUST 报告不匹配的 target、workdir、membership 或 CLI identity

#### Scenario: runtime identity 漂移
- **WHEN** environment identity、repository plan 或 checkout-local runtime projection identity 不再匹配 receipt
- **THEN** context MUST 返回 `stale` 或 `blocked`
- **AND** MUST 要求重新收敛 environment/runtime，而不是创建另一份纯 checkout

### Requirement: Runtime activation evidence 必须是按影响触发的特例
Buildr MUST 只在任务修改 Rules、Skills 或 runtime adapter，且验收明确要求证明新 runtime 已由 Agent 激活时检查 adapter-specific activation。该 evidence MUST 与普通 execution readiness 分离。

#### Scenario: Agent 提交 activation evidence
- **WHEN** Agent/runtime host 提交 reload 或新 session activation evidence
- **THEN** result MUST 将 environment evidence 标为 `buildr-verified`，将 host evidence 标为 `agent-attested`
- **AND** MUST 明确 Buildr 没有直接内省或自动启动 Agent host

#### Scenario: Codex 无法绑定既有 environment
- **WHEN** Codex 只支持 session-start，当前 App 又不能把新 session 绑定到既有 Buildr worktree
- **THEN** Buildr MUST 报告 activation evidence 缺口
- **AND** MUST NOT 创建指向该 worktree 的另一份纯 checkout或把 adoption receipt 包装成自动 handoff
