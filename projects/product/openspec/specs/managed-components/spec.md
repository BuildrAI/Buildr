# managed-components Specification

## Purpose
定义 Buildr 在 workspace 范围内以 Component 统一管理 Rules、Skills、Command collections 及其自然语言贡献的当前契约，覆盖来源登记、完整性与所有权校验、事务化生命周期、runtime 投射边界，以及随包 OpenSpec Component 的交付方式。
## Requirements

### Requirement: Workspace 管理 Component 源资产
Buildr MUST 支持在 workspace 级维护 Component，并将 Component 作为一个或多个 Rules、Skills 和 Command collections 的统一生命周期单元。

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
Buildr MUST 允许 Component 拥有一个或多个成员，成员类型限于当前 workspace 已支持的 Rules、Skills 和 Command collections。

#### Scenario: 跨资产类型 Component
- **WHEN** Component 定义同时声明 Command collection 和 Skills
- **THEN** Buildr MUST 将这些成员作为一个安装、更新和卸载单元管理

#### Scenario: 单成员 Component
- **WHEN** 用户明确要求将单个 Rule、Skill 或 Command collection 作为 Component 管理
- **THEN** Buildr MUST 允许 Component 只包含该成员

#### Scenario: 不包含 Project Scaffold
- **WHEN** Buildr 安装、更新或卸载 workspace Component
- **THEN** Buildr MUST NOT 因 Component 生命周期创建、修改或删除任何 Project 下的目录或内容

### Requirement: Component manifest 表达用户期望状态
Buildr MUST 使用 `components/manifest.yml` 保存 Component 的 workspace 选择状态，并将已安装 `component.yml` 作为上次成功物化的版本回执。

#### Scenario: 已安装 Component entry
- **WHEN** Component 安装成功
- **THEN** registry entry MUST 记录 `id`、`source`、`path`、`enabled: true`、`required` 和 `state: installed`

#### Scenario: 显式卸载状态
- **WHEN** 用户卸载 optional Component
- **THEN** Buildr MUST 保留 registry entry
- **AND** entry MUST 记录 `enabled: false` 和 `state: uninstalled`
- **AND** entry MAY 保存卸载 reason

#### Scenario: Required Component 不可卸载
- **WHEN** Agent 尝试卸载 `required: true` 的 Component
- **THEN** Buildr MUST 拒绝操作且不修改任何源资产或 runtime

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
- **WHEN** 两个已启用 Component 声明同一个 Rule、Skill 或 Command collection
- **THEN** Buildr MUST 将其报告为 ownership conflict
- **AND** Buildr MUST NOT 静默选择所有者

### Requirement: Component 更新使用三方比较
Buildr MUST 使用已安装 Component 定义、workspace 实际成员和当前交付定义区分安全升级与用户修改。

#### Scenario: 未修改旧版本安全升级
- **WHEN** workspace 实际成员匹配已安装 `component.yml` 的 integrity
- **AND** 当前 package 提供了新版本定义
- **THEN** Buildr MUST 能够安全更新成员
- **AND** Buildr MUST 在成员全部成功写入后最后更新 workspace `component.yml`

#### Scenario: 用户修改阻止升级
- **WHEN** workspace 实际成员同时不同于旧定义和新定义
- **THEN** Buildr MUST 将 Component 报告为 modified
- **AND** Buildr MUST NOT 静默覆盖成员或更新安装回执

#### Scenario: 安全新增和删除成员
- **WHEN** 新定义新增未冲突成员，或删除仍匹配旧 integrity 的成员
- **THEN** Buildr MUST 能够新增或删除对应成员
- **AND** 被删除成员已修改时 Buildr MUST 停止整个 Component 更新

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
- **THEN** Buildr MUST 在预检通过后删除其受管 Rule、Skill 和 Command collection 成员
- **AND** Buildr MUST 使用指定 adapter 清理对应 runtime 投射
- **AND** Buildr MUST 运行最终 `doctor --agent <agent> --json`

#### Scenario: Runtime reconcile 失败
- **WHEN** Component 源资产已经安全提交但 runtime reconcile 或最终 doctor 失败
- **THEN** Buildr MUST 返回失败状态
- **AND** Buildr MUST 将源资产保持为事实源并提供 runtime 修复动作
- **AND** Buildr MUST NOT 报告 Component 操作已经完整完成

### Requirement: Component 成员只能通过 Component 生命周期维护
Buildr MUST 阻止普通 Builtin、Rules、Skills 或 Commands 维护命令删除或替换已启用 Component 的成员。

#### Scenario: 单独删除 Component Skill
- **WHEN** Agent 对 Component-owned Skill 运行 `skills remove` 或 `builtin uninstall`
- **THEN** Buildr MUST 拒绝操作
- **AND** Buildr MUST 引导使用 `buildr component uninstall <id>`

#### Scenario: 单独修改 Component Command collection
- **WHEN** Agent 对 Component-owned Command collection 运行普通 `commands add`、`commands remove` 或替换操作
- **THEN** Buildr MUST 拒绝操作
- **AND** Buildr MUST 报告拥有该 collection 的 Component

#### Scenario: 用户自有资产不受限制
- **WHEN** Rule、Skill 或 Command collection 不属于已启用 Component
- **THEN** Buildr MUST 继续允许现有资产维护命令按各自契约工作

### Requirement: OpenSpec 作为首个随包 Component
Buildr MUST 随包提供 workspace 级 OpenSpec Component，统一管理 OpenSpec Command collection、经过评估的外部 workflow Skills 和 Buildr sidebar。

#### Scenario: OpenSpec Component 成员
- **WHEN** Buildr 初始化或更新默认启用 OpenSpec 的 workspace
- **THEN** OpenSpec Component MUST 包含 `commands/buildr/openspec/manifest.yml`
- **AND** Component MUST 以外部发布型 Skill 身份包含全部经 Buildr 评估支持的 `openspec-*` workflow Skills，包括 planning-only `openspec-update-change`
- **AND** Component MUST 包含已收敛到上游未覆盖职责的 `openspec-contract-guard` 和只表达 Buildr 特有增量的 sidebar contributions
- **AND** Component 定义 MUST 分别记录 OpenSpec 上游版本、外部 Skill 来源与 integrity，以及 Buildr sidebar 成员 integrity
- **AND** Component MUST NOT 在 `skills/buildr/openspec-*` 下物化外部 workflow Skill fork

#### Scenario: OpenSpec CLI 仍是外部工具
- **WHEN** OpenSpec Component 安装或更新
- **THEN** Buildr MUST 只声明并检查 OpenSpec CLI
- **AND** Buildr MUST NOT 自动安装、升级或卸载本机 OpenSpec CLI

#### Scenario: OpenSpec Component 不拥有 Project 数据
- **WHEN** OpenSpec Component 安装、更新或卸载
- **THEN** Buildr MUST NOT 创建、修改或删除任何 Project 的 `openspec/` 内容

### Requirement: OpenSpec Component 交付 Buildr 契约门禁 sidebar
Buildr MUST 将 OpenSpec 契约门禁作为现有 OpenSpec Component 的 Buildr 自有 sidebar 成员交付，并保持外部 OpenSpec 工具链的独立升级边界。

#### Scenario: OpenSpec Component 成员包含门禁 Skill
- **WHEN** Buildr 初始化或更新默认启用 OpenSpec 的 workspace
- **THEN** OpenSpec Component MUST 同时包含上游 workflow Skills、OpenSpec Command collection 和 `openspec-contract-guard` Skill
- **AND** Component integrity MUST 覆盖该门禁 Skill

#### Scenario: 门禁更新不改外部 Skills
- **WHEN** Buildr 发布新版契约门禁
- **THEN** Component update MUST 通过正常三方比较更新 Buildr sidebar 成员
- **AND** Component MUST NOT 为加入门禁而修改外部 `openspec-*` workflow Skill 的正文

#### Scenario: OpenSpec 1.6.0 上游升级
- **WHEN** Buildr 更新 OpenSpec Component 的 upstream version 和上游 workflow Skills 到 `1.6.0`
- **THEN** package verification MUST 同时验证门禁对该 upstream version 的兼容性
- **AND** Component MUST 保持外部 CLI 只声明和检查、Project OpenSpec 内容不归 Component 所有的既有边界
- **AND** Component MUST NOT 将 OpenSpec Stores beta 声明为 Component member、Buildr sidebar 或 Project-owned data
- **AND** package verification MUST 区分上游 1.6.0 已提供的 parser/archive safety 与 Buildr guard 保留的 baseline、active conflict、pre-sync receipt 和 post-sync evidence

### Requirement: Component 可以声明自然语言 Skill Contribution
Buildr MUST 允许 workspace Component 声明受 Component 生命周期和 integrity 统一管理的 Markdown Skill Contribution，并在 runtime source assembly 中非侵入式组合目标 Skill。

#### Scenario: Buildr 自有 Skill 使用 slot contribution
- **WHEN** Component 声明目标 Buildr Skill、稳定 slot 和 contribution fragment
- **THEN** fragment MUST 作为 Component member 被物化并纳入 integrity
- **AND** Agent runtime render MUST 只把 enabled installed Component 的 fragment 组合到目标 Skill 唯一声明的 slot
- **AND** workspace 中的目标 Skill 源 MUST 保持不变

#### Scenario: 外部 Skill 使用边界 contribution
- **WHEN** Component 对已解析外部 Skill 声明 `prepend` 或 `append` contribution
- **THEN** runtime source assembly MUST 以已验证的上游正文为基础生成带 provenance marker 的派生内容
- **AND** Buildr MUST NOT 修改外部 Skill 的 workspace 源正文
- **AND** Buildr MUST NOT 要求外部 Skill 包含 Buildr slot marker

#### Scenario: 卸载带 Skill Contribution 的 Component
- **WHEN** Component 被显式卸载并 reconcile 当前 Agent runtime
- **THEN** Component-owned fragment MUST 随其他 members 一起安全移除
- **AND** 重新渲染的目标 Skill MUST NOT 保留该 Component 的正文、命令或悬空路由

#### Scenario: Contribution 声明无效
- **WHEN** contribution 引用未登记 member、不安全路径、不支持的 placement，或 slot 目标没有唯一声明对应 slot
- **THEN** Component/package check 或 runtime render MUST fail closed
- **AND** Buildr MUST NOT 把 fragment 写入目标 Skill 源

#### Scenario: 可选目标 Skill 未安装
- **WHEN** contribution 的目标 Skill 为 disabled、uninstalled 或当前 scope 未解析到
- **THEN** runtime render MUST 跳过该 contribution，而不阻止其他 Skills 渲染
- **AND** 目标 Skill 后续安装并重新渲染时 MUST 自动获得该 contribution

### Requirement: Component 源资产通过统一 transaction 提交
Buildr MUST 在集合级预检通过后，通过受管数据完整性 transaction 提交 Component 成员、Rules/Skills manifests、Component registry 和已安装 definition。

#### Scenario: Component 更新中途失败
- **WHEN** Component install、update 或 uninstall 在任一 source commit step 失败
- **THEN** Buildr MUST 回滚本次已应用的成员和 manifest 变更
- **AND** workspace MUST 保持完整旧版本，或者保留可由 doctor 诊断且阻止后续 mutation 的 transaction

#### Scenario: Component source transaction 成功
- **WHEN** Component 全部成员和相关 manifest 成功提交
- **THEN** Buildr MUST 最后提交安装 definition 作为成功物化回执
- **AND** Buildr MUST 在 source transaction 完成后才 reconcile runtime

### Requirement: Component 不构成 runtime adapter 扩展机制
Buildr MUST 将 Component 限定为 workspace 源资产和自然语言 Skill Contribution 的生命周期边界，不得允许 Component 注册、替换、注入或执行 Agent runtime adapter。

#### Scenario: Component 声明 adapter 扩展
- **WHEN** Component definition 声明 adapter、adapter module、runtime hook、executable member 或 runtime registry patch
- **THEN** Component/package check MUST fail closed
- **AND** Buildr MUST NOT 注册、加载或执行该声明
- **AND** Buildr MUST NOT 因该 Component 改变 supported runtime adapter list

#### Scenario: Component runtime reconcile
- **WHEN** enabled installed Component 的源成员变化需要投射到 Agent runtime
- **THEN** Buildr MUST 先通过通用 Component 校验解析其受管源资产和 Skill Contributions
- **AND** Buildr MUST 将验证后的源输入交给静态 registered adapter 和通用 runtime reconcile 管线
- **AND** Component MUST NOT 提供 adapter-specific apply 逻辑

### Requirement: Component 必须验证自身完整性后参与 runtime 投射
Buildr MUST 在 Component 安装、更新、卸载、check、doctor 和 runtime source assembly 中验证 Component definition、成员和贡献声明的完整性，并禁止未通过验证的 Component 内容进入 runtime plan。

#### Scenario: Component 完整性有效
- **WHEN** Component definition schema、identity、source、version、成员枚举、成员路径、成员 integrity、ownership、manifest 对齐和 Contribution 引用全部有效
- **THEN** Buildr MUST 将该 Component 报告为完整
- **AND** enabled installed Component 的有效 Contributions MAY 进入 runtime source assembly

#### Scenario: Component 成员 integrity 不匹配
- **WHEN** workspace 中的 Component member 内容不匹配已安装 definition 记录的 integrity
- **THEN** Component check 和 doctor MUST 报告可归因到 Component 和 member 的 finding
- **AND** mutation preflight MUST fail closed
- **AND** runtime source assembly MUST NOT 消费该 Component 的未验证 Contribution 内容

#### Scenario: Contribution 声明不完整
- **WHEN** Skill Contribution 未引用已登记且 integrity 有效的 member，或其目标 Skill、稳定 slot、路径或 ownership 声明无效
- **THEN** Component/package check MUST 报告错误
- **AND** runtime planning MUST NOT 将该 fragment 组合到任何目标 Skill

#### Scenario: 无关 runtime diagnostics 仍可继续
- **WHEN** doctor 发现某个 Component 完整性失败
- **THEN** doctor MUST 保留 Component-specific error 和可执行修复建议
- **AND** doctor MUST 继续执行不消费该 Component 内容的 source asset 和 runtime 只读诊断
- **AND** Buildr MUST NOT 将需要该 Component 内容的 mutation 报告为完整成功

### Requirement: Component 只拥有 workspace Command catalog collection
Buildr Component MUST 只把 workspace `commands/<collection>/manifest.yml` 作为 Command member，并 MUST NOT 拥有 Project requirements 或 machine state。

#### Scenario: Component 安装 Command collection
- **WHEN** Component definition 声明 Command collection member
- **THEN** Component MAY 物化 workspace catalog definitions
- **AND** MUST NOT 创建或修改任一 Project `commands.yml`
- **AND** MUST NOT 安装 binary、写入凭证或生成 machine observation source

#### Scenario: Component 卸载被引用 collection
- **WHEN** Component 卸载或更新将删除某个 Command 的最后一个有效 definition
- **AND** 任一 Project requirement 仍引用该 Command ID
- **THEN** Buildr MUST 在 source transaction 前阻止整个 Component mutation
- **AND** MUST 列出引用 Projects 和解除引用 nextActions

#### Scenario: Component definition 冲突
- **WHEN** Component definition 与用户或其他 Component catalog collection 使用同一 Command ID 但 identity 字段不同
- **THEN** Buildr MUST 报告 catalog ownership/identity conflict
- **AND** Project requirement MUST NOT 用于选择其中一个 definition

### Requirement: Component Contribution 可以声明结构化 Skill capability dependency
Buildr MUST 允许 Component 在声明自然语言 Skill Contribution 时，为同一目标 Skill 声明结构化 capability dependency，并 MUST 通过同一 Component definition 和生命周期原子维护 fragment 与 dependency contribution。Buildr MUST NOT从 Markdown 正文推断 capability identity、version 或 mode。

#### Scenario: Contribution 引入 required dependency
- **WHEN** enabled installed Component 为自己已有 fragment 的目标 Skill 声明 capability、正整数 major version 与 `mode: required`
- **THEN** runtime Skill resolution MUST把该 dependency 合并进目标 consumer 的 effective `requires`
- **AND** provider missing、ambiguous、version mismatch、invalid binding 或 runtime unavailable MUST使该 consumer 按 capability graph fail closed

#### Scenario: Contribution 引入 optional dependency
- **WHEN** Component 声明 `mode: optional` 且 fragment 正文说明未 ready 时的安全降级或条件分支停止语义
- **THEN** capability graph MUST把目标 consumer 报告为 ready 或 degraded
- **AND** 命中需要该 provider 的条件分支时 Agent MUST按正文 fail closed，不得把 optional 解释为无条件可绕过

#### Scenario: Component 生命周期改变 dependency contribution
- **WHEN** Component install、update、disable、uninstall 或 restore 改变有效 definition
- **THEN** fragment 与 dependency contribution MUST在同一 Component lifecycle result 中同时生效或移除
- **AND** Buildr MUST NOT另行 patch 目标 Skill 源正文或要求维护者同步编辑 workspace Skill manifest

#### Scenario: Dependency contribution target 无效
- **WHEN** dependency target 不是同一 Component 的 Skill fragment target，字段未知，capability identity 非法，version 非正整数，mode 不受支持或 declaration 重复冲突
- **THEN** Component check/install/update MUST fail closed并保持旧 Component 与 runtime 状态
- **AND** Buildr MUST报告精确 target、declaration 与修复动作

#### Scenario: 多来源依赖确定性合并
- **WHEN** base Skill 或多个 enabled Components 为同一 target 声明相同 capability major version
- **THEN**相同 mode MUST去重，required 与 optional 并存时 effective mode MUST为 required
- **AND**结果 MUST不依赖 Component 安装顺序并保留可诊断 provenance
