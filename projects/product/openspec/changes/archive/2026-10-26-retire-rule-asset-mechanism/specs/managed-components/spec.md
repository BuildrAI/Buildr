## MODIFIED Requirements

### Requirement: Workspace 管理 Component 源资产
Buildr MUST 支持在 workspace 级维护 Component，并将 Component 作为一个或多个 Skills、Command collections 和 Skill Contributions 的统一生命周期单元。

#### Scenario: 初始化 Component registry
- **WHEN** Buildr 初始化新 workspace
- **THEN** Buildr MUST 创建 `components/manifest.yml`
- **AND** manifest MUST 声明 `schemaVersion: buildr.components/v1`

#### Scenario: Component 定义位置
- **WHEN** workspace 安装 Component `<id>`
- **THEN** Buildr MUST 将已安装定义保存在 `components/<source>/<id>/component.yml`
- **AND** 定义 MUST 声明 `schemaVersion: buildr.component/v1`、稳定 id、kind、version、来源、成员和成员 integrity

#### Scenario: 仅支持 workspace scope
- **WHEN** Agent 尝试在 Project 或 Service scope 安装 Component
- **THEN** Buildr MUST 拒绝该操作
- **AND** Buildr MUST 说明当前只支持 workspace Component

### Requirement: Component 支持单项或组合资产
Buildr MUST 允许 Component 拥有一个或多个成员，成员类型限于当前 workspace 已支持的 Skills、Command collections 和 Skill Contributions。

#### Scenario: 跨资产类型 Component
- **WHEN** Component 定义同时声明 Command collection、Skills 和 Skill Contributions
- **THEN** Buildr MUST 将这些成员作为一个安装、更新和卸载单元管理

#### Scenario: 单成员 Component
- **WHEN** 用户明确要求将单个 Skill、Command collection 或 Skill Contribution 作为 Component 管理
- **THEN** Buildr MUST 允许 Component 只包含该成员

#### Scenario: 非空 members.rules 退役
- **WHEN** workspace 或 package Component 定义声明非空 `members.rules`
- **THEN** Component check、install 与 `buildr package check` MUST 失败并给出迁移到 `AGENTS.md` 的指引
- **AND** Buildr MUST NOT 物化任何 Rule 成员或写入 `rules/manifest.yml`

#### Scenario: 空 members.rules 兼容
- **WHEN** 已有 Component 定义声明空 `members.rules`
- **THEN** Buildr MUST 将其读取为没有 Rule 成员
- **AND** Buildr MUST NOT 因该空字段创建 Rule manifest entry 或拒绝 Component 生命周期

#### Scenario: 不包含 Project Scaffold
- **WHEN** Buildr 安装、更新或卸载 workspace Component
- **THEN** Buildr MUST NOT 因 Component 生命周期创建、修改或删除任何 Project 下的目录或内容

### Requirement: Component 源资产变更采用集合级预检
Buildr MUST 在安装、更新或卸载 Component 前预检全部成员，并在发现未确认冲突时保持该 Component 的源资产不变。

#### Scenario: 安装目标冲突
- **WHEN** Component 成员 id、manifest path 或源路径已由其他 Component 或用户资产占用
- **THEN** Buildr MUST 报告冲突
- **AND** Buildr MUST NOT 物化该 Component 的任何成员

#### Scenario: 卸载前发现用户修改
- **WHEN** Component 成员内容不再匹配已安装定义记录的 integrity
- **THEN** Buildr MUST 停止卸载
- **AND** Buildr MUST NOT 删除用户修改或其他 Component 成员

#### Scenario: 成员唯一所有权
- **WHEN** 两个已启用 Component 声明同一个 Skill、Command collection 或 Skill Contribution
- **THEN** Buildr MUST 将其报告为 ownership conflict
- **AND** Buildr MUST NOT 静默选择所有者

### Requirement: Component CLI 完成源资产与 runtime 闭环
Buildr MUST 提供 Component list、check、install 和 uninstall 命令，并要求安装和卸载指定当前受支持的 Agent adapter。

#### Scenario: 查看 Component 状态
- **WHEN** Agent 运行 `buildr component list --target <dir> --json` 或 `buildr component check [<id>] --target <dir> --json`
- **THEN** Buildr MUST 输出 Component id、来源、版本、期望状态、实际状态、成员状态和可执行下一步

#### Scenario: 安装 Component
- **WHEN** Agent 运行 `buildr component install <id> --agent <agent> --target <dir>`
- **THEN** Buildr MUST 要求 target 是已初始化 workspace 且 Agent adapter 受支持
- **AND** Buildr MUST 预检并物化全部源资产成员
- **AND** Buildr MUST 使用指定 adapter reconcile Agent runtime
- **AND** Buildr MUST 运行最终 `doctor --agent <agent> --json`

#### Scenario: 卸载 Component
- **WHEN** Agent 运行 `buildr component uninstall <id> --agent <agent> --target <dir>`
- **THEN** Buildr MUST 在预检通过后删除其受管 Skill、Command collection 和 Skill Contribution 成员
- **AND** Buildr MUST 使用指定 adapter 清理对应 runtime 投射
- **AND** Buildr MUST 运行最终 `doctor --agent <agent> --json`

#### Scenario: Runtime reconcile 失败
- **WHEN** Component 源资产已经安全提交但 runtime reconcile 或最终 doctor 失败
- **THEN** Buildr MUST 返回失败状态
- **AND** Buildr MUST 将源资产保持为事实源并提供 runtime 修复动作
- **AND** Buildr MUST NOT 报告 Component 操作已经完整完成

### Requirement: Component 成员只能通过 Component 生命周期维护
Buildr MUST 阻止普通 Builtin、Skills 或 Commands 维护命令删除或替换已启用 Component 的成员。

#### Scenario: 单独删除 Component Skill
- **WHEN** Agent 对 Component-owned Skill 运行 `skills remove` 或 `builtin uninstall`
- **THEN** Buildr MUST 拒绝操作
- **AND** Buildr MUST 引导使用 `buildr component uninstall <id>`

#### Scenario: 单独修改 Component Command collection
- **WHEN** Agent 对 Component-owned Command collection 运行普通 `commands add`、`commands remove` 或替换操作
- **THEN** Buildr MUST 拒绝操作
- **AND** Buildr MUST 报告拥有该 collection 的 Component

#### Scenario: 用户自有资产不受限制
- **WHEN** Skill、Command collection 或 Skill Contribution 不属于已启用 Component
- **THEN** Buildr MUST 继续允许现有资产维护命令按各自契约工作

### Requirement: Component 源资产通过统一 transaction 提交
Buildr MUST 在集合级预检通过后，通过受管数据完整性 transaction 提交 Component 成员、Skills manifest、Component registry 和已安装 definition。

#### Scenario: Component 更新中途失败
- **WHEN** Component install、update 或 uninstall 在任一 source commit step 失败
- **THEN** Buildr MUST 回滚本次已应用的成员和 manifest 变更
- **AND** workspace MUST 保持完整旧版本，或者保留可由 doctor 诊断且阻止后续 mutation 的 transaction

#### Scenario: Component source transaction 成功
- **WHEN** Component 全部成员和相关 manifest 成功提交
- **THEN** Buildr MUST 最后提交安装 definition 作为成功物化回执
- **AND** Buildr MUST 在 source transaction 完成后才 reconcile runtime
