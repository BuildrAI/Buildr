## Why

Buildr Core 已要求“Rule 管边界、Skill 管流程”，但仍允许 Project/Service Rule 承载具体任务流程，导致 `AGENTS.md` 可能复制 Skill、Application 或声明文件已经拥有的命令、重跑和收尾步骤，形成第二权威并随实现漂移。前两个自举任务已经补齐默认 CLI identity 验证和 Service 所有权事实，现在需要把可复用的分层原则提升为随包 Core 契约，再据此收敛当前 workspace 的规则入口。

本变更不包含破坏性变更；它收紧的是 Agent 工作资产的权威边界，不改变已有专业能力、capability contract 或 binding。

## What Changes

- 强化 required Buildr Core：Project/Service `AGENTS.md` 只增加当前 scope 的价值观、权威与授权边界、约束和结果不变量，不承担 Skill routing、命令序列、生命周期步骤、重跑/恢复策略、报告模板或专业 Result。
- 明确 Rule 可以命名 Skill、capability、Application 或声明文件来指定唯一 owner 和禁止绕过，但不得复制其 playbook 或状态事实。
- 通过 package contract verification 保护该边界，避免随包 Core 再次把流程下放给 Project/Service Rules。
- 按新边界收敛自举 workspace 根、Product 与 Service `AGENTS.md`：只删除已有正式 owner 的重复流程；保留产品/Service 所有权、代码结构约束、禁止事项、授权边界和最终必须成立的不变量。
- 删除无内容、无 Task Record authority 的 `defer-self-bootstrap-final-doctor` 空 Change 占位目录；不将其当作历史交付事实。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-package-assets`: 收紧 required Core 与 Project/Service Rules 的职责边界，并要求 package verification 防止 Rule 复制专业流程或专业状态权威。

## Impact

- Buildr package 中的 canonical `rules/buildr/core.md` 源与相关 contract tests。
- 自举 workspace 根、Product Project、`buildr` Service 与 `buildr-web` Service 的 `AGENTS.md`。
- 不修改 Skill 正文、capability contracts、bindings、`preparation.yml` 或 `verification.yml`；现有 task-environment、task-development、task-verification、current knowledge/OpenSpec、task-finish、self-bootstrap 与 release owners 保持不变。
