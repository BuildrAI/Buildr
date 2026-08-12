## ADDED Requirements

### Requirement: 随包 task-worktree guidance 必须简洁且结构化
Buildr package MUST 以单一 routing description 和结构化正文交付 `task-worktree` guidance；description MUST 只表达触发意图与职责边界，正文 MUST 按决策、生命周期、协作交接、授权与停止条件组织，且 MUST NOT 重复 capability contract 的完整字段或在 Guardrails 中再次复述前文规则。

#### Scenario: 静态验证简洁结构
- **WHEN** Buildr 验证随包 `task-worktree` Skill
- **THEN** verifier MUST 确认 description 为单句 routing index
- **AND** verifier MUST 确认正文明确区分 create、reuse、none 与 blocked
- **AND** verifier MUST 拒绝重复的 contract evidence 清单、doctor/sync 入口段落和独立重复 Guardrails

#### Scenario: 复用仍执行当前状态门禁
- **WHEN** provider 复用 plan 完全一致且没有 tree transition 的既有 task environment
- **THEN** guidance MUST 只跳过 create-time doctor 与自动 sync
- **AND** guidance MUST 仍要求核对当前 context、membership、repository identities、CLI source 和本次动作需要的 clean/integration 状态

#### Scenario: 元内容升级为实现任务
- **WHEN** 未使用 task environment 的元内容任务后来进入代码修改、构建或测试
- **THEN** guidance MUST 要求先创建或复用 canonical task environment
- **AND** guidance MUST 只在证明 artifacts ownership、内容和唯一目标后收敛副本
- **AND** 无法证明为任务自有重复副本时 MUST 停止删除或覆盖

#### Scenario: capability 拓扑保持兼容
- **WHEN** Buildr 交付优化后的 `task-worktree` Skill
- **THEN** `buildr.task-worktree-lifecycle/v2` identity、provider、bindings、consumer readiness 和 CLI 行为 MUST 保持不变
