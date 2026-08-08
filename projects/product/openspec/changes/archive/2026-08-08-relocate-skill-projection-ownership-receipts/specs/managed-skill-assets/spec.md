## ADDED Requirements

### Requirement: Skill ownership receipt 跟随明确 destination 而不跟随 Agent runtime root
Buildr MUST 以 source Workspace、明确 destination、adapter 和 runtime path 定位 Skill projection ownership receipt，并 MUST 让 workspace 与 user 生命周期保持独立。

#### Scenario: Workspace render 只维护 workspace receipt
- **WHEN** Agent 运行 `buildr skills render <agent> --destination workspace --target <workspace>`
- **THEN** Buildr MUST 只维护 `<workspace>/.buildr/agent-runtime/workspace/<agent>/skill-projection-ownership-receipts/`
- **AND** MUST NOT 创建、更新、迁移或删除 user receipt

#### Scenario: User render 只维护 user receipt
- **WHEN** Agent 运行 `buildr skills render <agent> --destination user --target <workspace>`
- **THEN** Buildr MUST 只维护 `<user-home>/.buildr/agent-runtime/user/<agent>/skill-projection-ownership-receipts/`
- **AND** MUST NOT 创建、更新、迁移或删除 workspace receipt

#### Scenario: 整包更新提交 ownership receipt
- **WHEN** Buildr 受控更新同一 Skill asset identity 的 runtime 文件
- **THEN** canonical ownership receipt MUST 与该 destination 的 Skill 文件进入同一受管 mutation
- **AND** legacy receipt removal MUST 在 canonical receipt 可提交时才发生
