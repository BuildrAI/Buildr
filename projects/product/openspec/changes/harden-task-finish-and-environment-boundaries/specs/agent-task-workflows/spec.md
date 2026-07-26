## MODIFIED Requirements

### Requirement: Workflow 按任务影响验证 adapter activation
只有任务修改 runtime adapter 的 discovery、loading、activation mode、投射路径或相关 metadata，且专项验收要求证明新机制已激活时，workflow MUST 消费 adapter activation metadata。普通 Rule/Skill 内容、contract 或 description 修改 MUST NOT 触发新 session 门禁；该专项 evidence MUST NOT 阻塞普通 workflow。

#### Scenario: 普通 Skill 内容完成交付
- **WHEN** 任务修改 Skill 正文、contract 或 description，但没有改变 Agent runtime 的发现或激活机制
- **THEN** workflow MUST 使用 source、package、render/sync、projection 与 doctor evidence 验证交付
- **AND** MUST NOT 要求当前开发 session 重新加载新版 Skill

#### Scenario: Codex Skills discovery 机制专项验收
- **WHEN** 任务改变 Codex Skills 的 discovery、session-start loading 或投射机制，且验收需要证明新机制已激活
- **THEN** workflow MUST 说明 Rules 与 Skills 各自 activation mode
- **AND** Codex App 不能绑定既有 Buildr worktree 时 MUST 报告 evidence 缺口，不得伪造自动 handoff

#### Scenario: Runtime 支持显式 reload
- **WHEN** adapter activation 机制专项验收中声明 `explicit-reload`、提供 reload guidance 且 Agent/runtime host 返回匹配的 reload evidence
- **THEN** workflow MUST 接受 reload activation evidence
- **AND** 该 evidence MUST 与 execution readiness 分开记录
