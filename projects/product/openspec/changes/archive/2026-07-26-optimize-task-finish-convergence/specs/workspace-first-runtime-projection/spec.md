## MODIFIED Requirements

### Requirement: Runtime projection 必须提供 execution binding 与条件式 activation expectation
Buildr runtime adapter plan 与公开 runtime evidence MUST 提供 task environment 可消费的 adapter identity、runtime source root、projection identity 和 Rules/Skills activation metadata。projection identity MUST 参与普通 execution binding；session activation evidence MUST 只在 Rules、Skills/runtime adapter 变更且验收明确要求 activation proof 时检查。公开 evidence MUST 描述 Buildr 可证明的投射事实，不得声称目标 Agent 已在当前 session 加载 runtime。

#### Scenario: Session-start Skills 已投射到 task checkout
- **WHEN** Buildr 为 task environment 成功投射一个 Skills activation 为 `session-start` 的 runtime
- **THEN** runtime evidence MUST 返回 checkout-local runtime source root、projection identity 与 activation metadata
- **AND** 普通 proposal、implementation、verification 与 finish MUST NOT 等待 session adoption evidence

#### Scenario: Runtime projection identity 改变
- **WHEN** task environment 的 sync/render 改变了影响 Rules 或 Skills discovery 的 projection identity
- **THEN** runtime evidence MUST 使既有 execution binding 失效
- **AND** 如果当前验收另行要求 activation proof，既有 activation receipt MUST 同时可被识别为 stale

#### Scenario: Filesystem 无法证明 session consumption
- **WHEN** runtime check 只能证明投射内容与期望状态一致
- **THEN** result MUST 报告 projection ready 与 session consumption unknown
- **AND** MUST NOT 仅凭文件存在、content identity 或 checker success 报告 session adopted

### Requirement: Codex runtime evidence 必须保持 path-read 与 session-start 边界
Codex adapter MUST 继续将 Rules activation 声明为 `path-read`、Skills activation 声明为 `session-start`，并 MUST 将 activation guidance 标记为条件式验收信息，而不是普通 task environment readiness 门禁。

#### Scenario: Codex task environment runtime 准备完成
- **WHEN** checkout-local Codex runtime 已通过 sync 与 doctor
- **THEN** Buildr MUST 报告 Rules 和 Skills 各自的 activation mode、runtime source root 与 projection identity
- **AND** 只有验收明确要求证明 checkout-local Skills 已被 Agent 激活时，才 MUST 请求 host 可提供的 reload/session evidence；无法绑定既有 environment 时 MUST 如实报告缺口
