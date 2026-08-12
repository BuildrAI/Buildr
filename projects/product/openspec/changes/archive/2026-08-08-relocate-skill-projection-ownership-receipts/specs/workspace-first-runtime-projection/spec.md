## ADDED Requirements

### Requirement: Skill 投射所有权回执使用 Buildr destination 控制状态根
Buildr MUST 将 Skill 投射所有权回执与 Agent 实际消费的 runtime root 分离，并 MUST 使用 destination-aware 的 Buildr 控制状态路径作为唯一 canonical authority。

#### Scenario: Workspace Skill 投射回执路径
- **WHEN** Buildr 为 adapter `<adapter>` 的 workspace destination 投射 runtime path `<runtime-path>`
- **THEN** 回执 MUST 写入 `<workspace>/.buildr/agent-runtime/workspace/<adapter>/skill-projection-ownership-receipts/<runtime-path>.json`
- **AND** 实际 Skill MUST 继续写入 adapter 声明的 workspace Skills root

#### Scenario: User Skill 投射回执路径
- **WHEN** Buildr 为 adapter `<adapter>` 的 user destination 投射 runtime path `<runtime-path>`
- **THEN** 回执 MUST 写入 `<user-home>/.buildr/agent-runtime/user/<adapter>/skill-projection-ownership-receipts/<runtime-path>.json`
- **AND** 实际 Skill MUST 继续写入 adapter 声明的 user Skills root

#### Scenario: User home 同时是 Workspace
- **WHEN** workspace root 与 user home 指向同一目录
- **THEN** workspace 与 user 回执 MUST 仍由路径中的 `workspace` 和 `user` 分段保持隔离
- **AND** 任一 destination 的 render MUST NOT 覆盖另一 destination 的回执

### Requirement: 旧 runtime-root 回执受控迁移到 canonical 路径
Buildr MUST 只把旧 adapter runtime root 中的有效投射回执作为一次性迁移输入，并 MUST 在迁移后维持单一 canonical authority。

#### Scenario: 只有有效旧回执
- **WHEN** canonical 回执缺失、legacy 回执 schema 与 identity 有效且其文件 inventory 仍匹配 runtime
- **THEN** 下一次适用 mutation MUST 在同一受管 transaction 中写入 canonical 回执并删除 legacy 回执
- **AND** transaction 失败 MUST 恢复操作前状态

#### Scenario: 新旧回执内容等价
- **WHEN** canonical 与 legacy 回执同时存在且 identity、digest 与 inventory 等价
- **THEN** Buildr MUST 保留 canonical 回执并受控删除 legacy 回执
- **AND** MUST NOT 改写未变化的 runtime Skill 文件

#### Scenario: 新旧回执发生冲突
- **WHEN** canonical 与 legacy 回执的 identity、digest 或 inventory 不一致
- **THEN** Buildr MUST 在写入任何计划目标前报告 ownership conflict
- **AND** Buildr MUST 保留两份回执和全部 runtime 文件

#### Scenario: 旧回执无法证明 runtime ownership
- **WHEN** legacy 回执无效或其登记文件不再匹配 runtime
- **THEN** Buildr MUST 保留现场并阻塞自动迁移、更新和清理
- **AND** Buildr MUST NOT 通过长期双读或目录内容推断取得 ownership
