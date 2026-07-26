## MODIFIED Requirements

### Requirement: Runtime projection 必须提供 execution binding 与条件式 activation expectation
Buildr runtime adapter plan 与公开 runtime evidence MUST 提供 task environment 可消费的 adapter identity、runtime source root、projection identity 和 Rules/Skills activation metadata。projection identity MUST 参与普通 execution binding；session activation evidence MUST 只在 runtime discovery、loading、activation mode、投射路径或相关 metadata 发生变化且专项验收明确要求 activation proof 时检查。普通 Rule/Skill 内容修改 MUST NOT 因 Skills activation mode 为 `session-start` 而要求新 session。公开 evidence MUST 描述 Buildr 可证明的投射事实，不得声称目标 Agent 已在当前 session 加载 runtime。

#### Scenario: Session-start Skills 已投射到 task checkout
- **WHEN** Buildr 为 task environment 成功投射一个 Skills activation 为 `session-start` 的 runtime
- **THEN** runtime evidence MUST 返回 runtime source root、projection identity 与 activation metadata
- **AND** 普通 proposal、implementation、verification 与 finish MUST NOT 等待 session adoption evidence

#### Scenario: Runtime projection identity 改变
- **WHEN** task environment 的 sync/render 改变了影响 Rules 或 Skills discovery 的 projection identity
- **THEN** runtime evidence MUST 使既有 execution binding 失效
- **AND** 只有当前专项验收要求 activation proof 时，既有 activation receipt 才 MUST 同时可被识别为 stale

#### Scenario: Filesystem 无法证明 session consumption
- **WHEN** runtime check 只能证明投射内容与期望状态一致
- **THEN** result MUST 报告 projection ready 与 session consumption unknown
- **AND** MUST NOT 仅凭文件存在、content identity 或 checker success 报告 session adopted
