## MODIFIED Requirements

### Requirement: 已有 workspace 升级兼容
Buildr MUST 通过 sync 支持已有 Buildr workspace 升级到内置能力和 adapter render 模型，同时不静默覆盖用户编写的规则正文。

#### Scenario: 修复根 AGENTS required block
- **WHEN** 已有 workspace 的根 `AGENTS.md` 缺少或破坏 Buildr required block
- **THEN** Buildr sync MUST 恢复 required block，使其正文与随包内联规则一致
- **AND** Buildr MUST NOT 覆盖 `AGENTS.md` 的用户正文

#### Scenario: 迁入产品 baseline 规则
- **WHEN** 已有 workspace 使用旧版 package baseline rules
- **THEN** Buildr sync MUST 将核心规则内联到根 `AGENTS.md`，其他专业规则仍使用通用规则清单
- **AND** `runtime.md` 的语义 MUST 内化进 根 `AGENTS.md` 受管区块

#### Scenario: 清单引用的旧共享资源不可解析
- **WHEN** workspace 清单中的官方 `resource:` 引用在当前共享集及退役封存中均不可解析
- **THEN** sync 收敛 MUST 将该条目按缺源处理并交由既有 installed/modified/missing 与 replaces 判定，不得因解析失败中断整次收敛
- **AND** 结果 MUST 在 findings 中定位该来源缺失，供 Agent 与用户解释

#### Scenario: MVP 不提供 migrate 命令
- **WHEN** Buildr 处于本变更的 MVP 实施阶段
- **THEN** Buildr MUST NOT 要求实现 `buildr migrate agents`
- **AND** Buildr MUST 通过 doctor 兼容提示保护已有 workspace
