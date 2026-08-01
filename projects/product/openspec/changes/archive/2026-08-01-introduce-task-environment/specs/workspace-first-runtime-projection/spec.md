## MODIFIED Requirements

### Requirement: Runtime projection 必须提供 execution binding 与条件式 activation expectation
Buildr runtime adapter plan 与公开 runtime evidence MUST 提供 Task Environment 可消费的 adapter identity、runtime source root、projection target/root、projection identity 和 Rules/Skills activation metadata。Task Environment MUST 将匹配的 projection identity 纳入 execution binding，但 MUST 只记录 projection facts；真实 Agent session activation evidence MUST 由 Task Verification 在 runtime discovery、loading、activation mode、投射路径或相关 metadata 发生变化且专项验收要求时持有。普通 Rule/Skill 内容、contract 或 description 修改 MUST NOT 因 Skills activation mode 为 `session-start` 而要求新 session。

#### Scenario: Session-start Skills 已投射到任务验证工作区
- **WHEN** Buildr 为 receipt 绑定的 Task Validation Workspace 成功投射一个 Skills activation 为 `session-start` 的 runtime
- **THEN** runtime evidence MUST 返回 runtime source root、target root、projection identity 与 activation metadata
- **AND** Environment `ready` 与普通 proposal、implementation、verification/finish routing MUST NOT 等待 session adoption evidence

#### Scenario: 候选 source 投射自身验证根
- **WHEN** candidate Product source 把同一 Environment Receipt 登记的 Task Validation Workspace 作为 target
- **THEN** runtime guard MUST 允许 workspace-scoped projection 和验证根内隔离模拟 user destination
- **AND** evidence MUST 明确这是候选验证投射，不是 retained runtime 或真实共享用户 runtime 已生效

#### Scenario: 候选 source 请求越界 target
- **WHEN** candidate Product source 请求写入 retained Workspace、peer task worktree 或 Task Validation Workspace 之外的共享 user runtime
- **THEN** runtime guard MUST 在任何写入前 fail closed
- **AND** MUST 返回 candidate source、允许根和越界 target identity

#### Scenario: Runtime projection identity 改变
- **WHEN** Task Validation Workspace 的 sync/render 改变了影响 Rules 或 Skills discovery 的 projection identity
- **THEN** Environment MUST 将既有 execution binding 识别为 stale 并重新 probe
- **AND** 只有当前专项验收要求 activation proof 时，Task Verification 中既有 session evidence 才 MUST 同时失效

#### Scenario: Filesystem 无法证明 session consumption
- **WHEN** runtime check 只能证明投射内容与期望状态一致
- **THEN** result MUST 报告 projection ready 与 session consumption unknown/not-applicable
- **AND** MUST NOT 仅凭文件存在、content identity、Environment Receipt 或 checker success 报告 session adopted

### Requirement: Codex runtime evidence 必须保持 path-read 与 session-start 边界
Codex adapter MUST 继续将 Rules activation 声明为 `path-read`、Skills activation 声明为 `session-start`，并 MUST 将 activation guidance 标记为 Task Verification 的条件式验收信息，而不是 Task Environment `ready` 门禁。Environment Receipt MAY 引用 Codex runtime source/projection identity，但 MUST NOT 保存 session handle、adoption mode 或 activation 结论。

#### Scenario: Codex 任务验证工作区 runtime 准备完成
- **WHEN** checkout-local Codex runtime 已在 Task Validation Workspace 通过 sync 与 doctor
- **THEN** Buildr MUST 报告 Rules/Skills activation mode、runtime source root、target root 与 projection identity
- **AND** Task Environment MUST 只据此判断 projection readiness，不要求当前会话重新加载 Skill

#### Scenario: Codex 专项验收需要真实采用
- **WHEN** 变更影响 Codex Skills discovery/session-start loading/投射机制，且 P0.4 验收明确要求真实 Agent session proof
- **THEN** Task Verification MUST 绑定 Environment/source/projection/session identity 记录实际 evidence 或如实缺口
- **AND** Environment Receipt、`ready` 与普通 workflow MUST NOT 因无法把新 session 绑定到既有 worktree 而伪造 adoption 或创建第二份 checkout
