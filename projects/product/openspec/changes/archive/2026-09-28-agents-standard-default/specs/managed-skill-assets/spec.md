## MODIFIED Requirements

### Requirement: Skill ownership receipt 跟随明确 destination 而不跟随 Agent runtime root
Buildr MUST 以 source Workspace、明确 destination、文件归属身份和 runtime path 定位 Skill projection ownership receipt，并 MUST 让 workspace 与 user 生命周期保持独立。

#### Scenario: Workspace render 只维护 workspace receipt
- **WHEN** Agent 运行 `buildr skills render <agent> --destination workspace --target <workspace>`
- **THEN** Buildr MUST 只维护 `<workspace>/.buildr/agent-runtime/workspace/<ownership-id>/skill-projection-ownership-receipts/`
- **AND** MUST NOT 创建、更新、迁移或删除 user receipt

#### Scenario: User render 只维护 user receipt
- **WHEN** Agent 运行 `buildr skills render <agent> --destination user --target <workspace>`
- **THEN** Buildr MUST 只维护 `<user-home>/.buildr/agent-runtime/user/<ownership-id>/skill-projection-ownership-receipts/`
- **AND** MUST NOT 创建、更新、迁移或删除 workspace receipt

#### Scenario: 整包更新提交 ownership receipt
- **WHEN** Buildr 受控更新同一 Skill asset identity 的 runtime 文件
- **THEN** canonical ownership receipt MUST 与该 destination 的 Skill 文件进入同一受管 mutation
- **AND** legacy receipt removal MUST 在 canonical receipt 可提交时才发生

#### Scenario: 共享标准目录不按品牌重复认领
- **WHEN** 多个品牌消费同一 `.agents/skills/` 文件
- **THEN** `ownership-id` MUST 为 `agents-standard`，而不是调用者品牌
- **AND** 品牌请求身份 MUST NOT 改变文件所有权

## ADDED Requirements

### Requirement: 通用技能不依赖品牌白名单
Buildr MUST 将未声明 runtimes 限制的技能（Skill）视为通用资产，且随包通用技能（Skill）MUST 不再展开有限品牌白名单。

#### Scenario: 新品牌获得通用技能
- **WHEN** 有效新品牌使用标准适配器（Adapter）
- **THEN** MUST 安装所有启用、未限制品牌且可解析的通用技能（Skill），无需逐品牌更新清单

#### Scenario: 保留用户明确限制
- **WHEN** 用户技能（Skill）明确声明 runtimes
- **THEN** MUST 按真实 runtimeId 判断适用性，而非 adapterId 或另一个品牌
- **AND** 身份未知时 MUST NOT 把标准约定当作获准品牌

#### Scenario: 更新历史内置技能声明
- **WHEN** update 或 sync 更新仍受产品管理的内置技能（Skill）
- **THEN** MUST 将旧产品拥有的品牌枚举升级为通用声明
- **AND** MUST 保留用户资产的明确限制、绑定和卸载状态

### Requirement: 标准技能输出采用一级身份目录
Buildr MUST 在标准共享目录中将每个技能（Skill）输出到 `.agents/skills/<skill-id>/SKILL.md`，并保留源目录及随附资源语义。

#### Scenario: 源目录嵌套
- **WHEN** 通用技能（Skill）源位于多层目录或旧 runtimePath 为多层路径
- **THEN** 标准目标 MUST 采用技能（Skill）标识的一层目录
- **AND** 脚本、模板、参考文件在技能（Skill）内的相对路径 MUST 不变
- **AND** 能力绑定中的提供者路径 MUST 指向实际标准目标
