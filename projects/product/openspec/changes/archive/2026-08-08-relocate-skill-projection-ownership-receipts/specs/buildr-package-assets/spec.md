## ADDED Requirements

### Requirement: Workspace 忽略本地 Agent runtime ownership receipts
Buildr package、Workspace 初始化与 Workspace sync MUST 幂等维护根 `.gitignore` 中的 `/.buildr/agent-runtime/`，使 workspace Skill projection ownership receipts 保持 Workspace-local。

#### Scenario: 新 Workspace 初始化
- **WHEN** Buildr 使用当前 package 初始化 Workspace
- **THEN** 根 `.gitignore` MUST 包含且只包含一次 `/.buildr/agent-runtime/`
- **AND** `.buildr/workspace.yml` MUST NOT 因此被忽略

#### Scenario: 现有 Workspace sync
- **WHEN** 已初始化 Workspace 缺少 `/.buildr/agent-runtime/` ignore 并运行 sync
- **THEN** Buildr MUST 以保留用户内容的幂等追加语义补齐该条目
- **AND** MUST NOT 修改 Git index 或删除已有 runtime receipts

#### Scenario: 重复 sync
- **WHEN** Workspace 已含 `/.buildr/agent-runtime/` 并再次运行 sync
- **THEN** Buildr MUST NOT 生成重复条目或无关 `.gitignore` 改写
