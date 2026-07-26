## MODIFIED Requirements

### Requirement: Task environment 必须核验 execution binding
Buildr MUST 以 environment receipt、repository membership/identity、allowed execution roots、environment-bound CLI/runtime projection identity 和明确 target/workdir 判断 `executionReady`。自举 Workspace MUST 使用 environment 内对应的产品 CLI；没有产品源码成员的普通 Workspace MAY 使用 receipt 显式声明的 external-product CLI。Agent session root MUST NOT 是普通 proposal、implementation、verification 或 finish 的必要条件，也 MUST NOT 被要求等于 environment root。

#### Scenario: canonical workspace 对话操作自举 task environment
- **WHEN** Agent session 从 canonical Workspace 启动，并在 create 后使用 task environment 的明确 target、成员 checkout workdir 和 environment-local CLI
- **THEN** context MUST 在 environment、repository、CLI 与 runtime identity 匹配时返回 `executionReady: true`
- **AND** canonical Workspace 中已加载的能力 MUST NOT 因 session root 不同而失效

#### Scenario: 普通 Workspace 使用外部产品 CLI
- **WHEN** Buildr 产品源码不属于目标 Workspace repository set，receipt 已声明 external-product CLI identity，且命令使用 environment target/workdir
- **THEN** context MAY 返回 `executionReady: true`
- **AND** result MUST 将 CLI source kind 与 `checkoutLocal: false` 明确披露，不得伪装为 environment-local CLI

#### Scenario: 请求路径或 CLI 越界
- **WHEN** target/workdir 不属于 allowed execution roots，或当前 CLI/runtime projection identity 不匹配 receipt 声明的 environment-bound source
- **THEN** context MUST 返回 blocked 并 fail closed
- **AND** MUST 报告不匹配的 target、workdir、membership、CLI source kind 或 identity

#### Scenario: runtime identity 漂移
- **WHEN** environment identity、repository plan 或 runtime projection identity 不再匹配 receipt
- **THEN** context MUST 返回 `stale` 或 `blocked`
- **AND** MUST 要求重新收敛 environment/runtime，而不是创建另一份纯 checkout

### Requirement: Runtime activation evidence 必须是按影响触发的特例
Buildr MUST 只在任务修改 Agent runtime 的 discovery、loading、activation mode、投射路径或相关 metadata，且验收明确要求证明新机制已由 Agent 激活时检查 adapter-specific activation。普通 Rule/Skill 内容修改 MUST 使用源资产、render/sync、runtime projection 与 doctor evidence，不得因此要求新 session。该 evidence MUST 与普通 execution readiness 分离。

#### Scenario: 普通 Rule 或 Skill 内容修改
- **WHEN** 任务只修改 Rule/Skill 内容、capability contract 或 routing description，没有改变 runtime discovery/loading/activation 机制
- **THEN** Buildr MUST NOT 要求新 session、reload、re-enter 或 adoption receipt 作为完成条件
- **AND** create/reuse 结果 MUST NOT 返回 session handoff next action

#### Scenario: Agent 提交专项 activation evidence
- **WHEN** runtime 机制变更的专项验收提交 reload 或新 session activation evidence
- **THEN** result MUST 将 environment evidence 标为 `buildr-verified`，将 host evidence 标为 `agent-attested`
- **AND** receipt 与再次核验 MUST 同时绑定规范化 session root 和 session handle
- **AND** MUST 明确 Buildr 没有直接内省或自动启动 Agent host

#### Scenario: activation session identity 改变
- **WHEN** 当前 session root 或 handle 与 adoption receipt 不匹配
- **THEN** Buildr MUST 返回 activation evidence mismatch
- **AND** 普通 `executionReady` MAY 保持有效，但专项 activation proof MUST NOT 返回 verified

#### Scenario: Codex 无法绑定既有 environment
- **WHEN** runtime 机制专项验收要求 Codex session-start evidence，但当前 App 不能把新 session 绑定到既有 Buildr worktree
- **THEN** Buildr MUST 报告 activation evidence 缺口
- **AND** MUST NOT 创建指向该 worktree 的另一份纯 checkout或把 adoption receipt 包装成自动 handoff
