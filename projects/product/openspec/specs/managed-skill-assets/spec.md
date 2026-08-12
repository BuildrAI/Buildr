# Managed Skill Assets

## Purpose

定义 workspace Skill 源资产、Project capability/applicability context、类型、manifest schema 和 Agent runtime 投射契约。
## Requirements

### Requirement: Skills registry 必须复用 canonical Workspace identity
Buildr MUST 让 `skills/manifest.yml.workspaceId` 引用 `.buildr/workspace.yml.id` 表示的同一个 Workspace UUID，不得维护第二套独立 Workspace identity。

#### Scenario: 初始化新的 Workspace
- **WHEN** Buildr 初始化新的 Workspace
- **THEN** Buildr MUST 只生成一次 Workspace UUID
- **AND** `.buildr/workspace.yml.id` 与 `skills/manifest.yml.workspaceId` MUST 写入相同值

#### Scenario: 迁移已有 Skills registry identity
- **WHEN** 旧 Workspace 尚无 `.buildr/workspace.yml.id`，但 `skills/manifest.yml.workspaceId` 是合法 UUID
- **THEN** Workspace metadata migration MUST 复用该 UUID
- **AND** MUST NOT 另外生成 Workspace identity

#### Scenario: 补齐缺失的 Skills registry identity
- **WHEN** `.buildr/workspace.yml.id` 已存在且合法，但 `skills/manifest.yml.workspaceId` 缺失
- **THEN** 受控 Workspace migration MUST 将 canonical Workspace UUID 写入 Skills registry
- **AND** 写入 MUST 与 Workspace metadata migration 属于同一个可回滚 transaction

#### Scenario: 两处 Workspace identity 冲突
- **WHEN** `.buildr/workspace.yml.id` 与 `skills/manifest.yml.workspaceId` 都存在但值不同
- **THEN** Buildr MUST 在任何 mutation 前 fail closed
- **AND** doctor MUST 报告两个 identity 的来源与修复要求
- **AND** update、sync、migration 和 UI MUST NOT 静默选择其中一个或产生部分写入

### Requirement: 本地与 package Skill 完整投射受支持目录
Buildr MUST 将启用且适用于当前 runtime 的本地作者型 Skill 和 package Skill 的受支持源目录内容完整投射到 Agent Skill runtime 目录，并 MUST 保持 Skill 入口派生内容与随附资源的不同处理边界。

#### Scenario: 渲染带随附资源的本地 Skill
- **WHEN** 本地作者型 Skill 包含 `SKILL.md` 以及 `agents/`、`assets/`、`scripts/`、`templates/`、`examples/` 或 `references/` 下的普通文件
- **THEN** Buildr MUST 将 `SKILL.md` 和所有受支持随附文件投射到同一 runtime Skill 目录的对应相对路径
- **AND** runtime 中的目录结构 MUST 与源 Skill 的受支持目录结构一致

#### Scenario: 渲染 package Skill
- **WHEN** workspace manifest 通过 `package:<source-id>` 引用随包 Skill source
- **THEN** Buildr MUST 从 package Skill 完整源目录生成 runtime Skill
- **AND** Buildr MUST NOT 只因该 Skill 通过 package reference 解析而丢弃随附文件

#### Scenario: Skill 入口继续由 Buildr 派生
- **WHEN** Buildr 渲染完整 Skill 目录
- **THEN** runtime `SKILL.md` MUST 继续包含适用的 managed marker、contributions、capability bindings 和 adapter context
- **AND** 其他随附文件 MUST 保持源文件原始字节，不得注入 `SKILL.md` 专用内容

#### Scenario: 脚本保持可执行
- **WHEN** 受支持 Skill 目录中的普通文件具有 owner executable bit
- **THEN** Buildr MUST 在支持 POSIX 权限的 runtime target 上保留 owner executable 状态
- **AND** Buildr MUST NOT 把 source 的无关 group 或 other 权限当作 Skill 行为契约

#### Scenario: 远端单文件来源保持边界
- **WHEN** Skill 使用 `resolved.kind: skill-url`
- **THEN** Buildr MUST 继续把该来源解释为单个 raw `SKILL.md`
- **AND** Buildr MUST NOT 猜测、抓取或合成该 URL 未声明的随附目录

#### Scenario: 拒绝不安全的 Skill 包成员
- **WHEN** 本地或 package Skill 的受支持目录中包含符号链接、路径逃逸或非普通文件
- **THEN** Buildr MUST 在写入任何 runtime 文件前拒绝该次投射
- **AND** Buildr MUST NOT 跟随该成员读取或写入 Skill 源目录和 runtime target 之外的内容

### Requirement: Buildr Skill 前置说明 Skill 类型和安装方式
Buildr 内置 Skill 的 `SKILL.md` MUST 在资产维护细节前说明 workspace Skill source 类型、Project capability/applicability context 和 user/workspace render destination。

#### Scenario: 前置 Skill 类型
- **WHEN** Agent 阅读 Buildr Skill
- **THEN** Buildr Skill MUST 先说明本地作者型 Skill 和远端发布型 Skill 的区别
- **AND** Buildr Skill MUST 说明两类 Skill 都登记到 workspace source authority
- **AND** Buildr Skill MUST 说明 Project 专用语义通过 capability/applicability context 表达

#### Scenario: 前置三种登记方式
- **WHEN** Agent 阅读 Buildr Skill
- **THEN** Buildr Skill MUST 说明本地源目录、远端信息源和已解析安装源三种 workspace 登记方式
- **AND** Buildr Skill MUST 引导 Agent 先登记 source，再在能解析时升级为 resolved

#### Scenario: 前置两种 render destination
- **WHEN** Agent 阅读 Buildr Skill
- **THEN** Buildr Skill MUST 说明 `workspace` destination 只面向当前工作目录
- **AND** Buildr Skill MUST 说明 `user` destination 需要显式授权并面向当前用户的其他工作目录
- **AND** Buildr Skill MUST NOT 把 Project 描述为第三种 source 或 destination

### Requirement: 已解析外部 Skill 保持上游源资产身份
Buildr MUST 将随包或 workspace Component 使用的已解析外部 Skill 物化为可验证的上游源资产，并将任何 Buildr 增强限制在 Agent runtime 派生阶段。

#### Scenario: 物化已解析外部 Skill
- **WHEN** enabled Component 声明一个具有 source、resolved source、version 和 integrity 的外部 Skill
- **THEN** Buildr MUST 将其物化到非 `skills/buildr/` 的来源命名空间
- **AND** 物化内容 MUST 匹配 resolved source 的版本和 integrity
- **AND** Buildr MUST NOT 将包含 sidebar 修改的副本登记为该外部 Skill 的源资产

#### Scenario: 渲染外部 Skill 派生版本
- **WHEN** 外部 Skill 与 enabled sidebar contribution 一起参与 Agent runtime render
- **THEN** runtime Skill MUST 由已验证上游内容和已验证 contributions 确定性组合
- **AND** runtime receipt/check MUST 追踪上游来源与每个 contribution provenance
- **AND** workspace 外部 Skill 的源内容 MUST 保持不变

#### Scenario: 外部 Skill 上游更新
- **WHEN** resolved source、version 或 integrity 更新
- **THEN** Buildr MUST 先验证新的上游内容和 sidebar 兼容性
- **AND** 验证通过后 MUST 以新上游内容重新生成 runtime 派生版本
- **AND** Buildr sidebar 内容 MUST 从独立的 Buildr-owned members 继续组合，不得人工合并回外部源正文

### Requirement: Skill 生命周期保留 capability declarations
Buildr MUST 在 Skill add/remove、builtin install/uninstall/restore、update、sync 和 render 生命周期中一致维护 capability identity、dependency 和 binding 信息，并 MUST 避免普通安装或更新静默改变现有 provider 选择。

#### Scenario: 更新 managed builtin provider
- **WHEN** package update changes a managed builtin Skill that provides or requires capabilities
- **THEN** Buildr MUST reconcile package-owned declarations while preserving user-owned bindings and uninstall state
- **AND** Buildr MUST only require pre-mutation impact disclosure when the update would remove、disable or rebind a selected provider
- **AND** final doctor MUST report the resulting dependency graph

#### Scenario: 移除用户 provider
- **WHEN** Agent removes a user Skill that is selected by one or more bindings
- **THEN** Buildr MUST expose the affected required and optional consumers before mutation
- **AND** Buildr MUST preserve enough manifest evidence for doctor to explain any resulting missing or ambiguous dependency

### Requirement: Skills CLI 提供最小 capability 声明与 binding 写入口
Buildr MUST 让 Agent 通过事务化 Skills CLI 声明 provider/consumer 和显式 binding，而不要求普通用户直接编辑 `buildr.skills/v2` 嵌套结构。

#### Scenario: 添加 provider 或 consumer declarations
- **WHEN** Agent 运行 `buildr skills add` 或 replace 并提供重复的 `--provides <capability>@<version>` 或 `--requires <capability>@<version>:<required|optional>`
- **THEN** Buildr MUST 校验 contract identity、version、scope、重复声明和 dependency mode 后再写入 Skill entry
- **AND** command MUST preserve all v2 contract、binding 和 unrelated Skill data not owned by the mutation

#### Scenario: 显式绑定 provider
- **WHEN** Agent 运行 `buildr skills bind <capability>@<version> --provider <skill-id> --scope <scope> --target <dir>`
- **THEN** Buildr MUST 校验 contract 和 provider 在该 scope 可见且 version 兼容
- **AND** Buildr MUST transactionally write only the selected scope binding and run final doctor
- **AND** command MUST NOT install the provider、uninstall builtin or claim behavior verification

#### Scenario: 删除显式 binding
- **WHEN** Agent 运行 `buildr skills unbind <capability>@<version> --scope <scope> --target <dir>`
- **THEN** Buildr MUST 删除且只删除当前 scope 的 matching binding
- **AND** resolver MUST 根据剩余 visible providers 产生 ready、blocked 或 degraded 结果
- **AND** final doctor MUST report any resulting ambiguity or missing provider

### Requirement: Skill 可移植核心与 adapter 可选扩展分层
Buildr MUST 将 Skill 的可移植核心合法性与 Agent runtime adapter 的可选 vendor 扩展分别校验，且 MUST NOT 使用单一厂商扩展定义所有 builtin Skill 的通用合法性或发布资格。

#### Scenario: 校验 Skill 可移植核心
- **WHEN** Buildr 对本地、package 或 builtin Skill 执行通用源结构校验
- **THEN** Buildr MUST 要求存在有效的 `SKILL.md`
- **AND** `agents/`、`assets/`、`templates/`、`scripts/`、`references/`、`examples/` 和其他随附文件 MUST 是可选核心资源
- **AND** 缺少 `agents/openai.yaml` MUST NOT 单独使该 Skill 的通用源结构非法

#### Scenario: 校验已提供的 adapter 扩展
- **WHEN** Skill 包含目标 supported runtime adapter descriptor 声明的可选 vendor extension
- **THEN** Buildr MUST 应用该 adapter 声明的 extension validator
- **AND** 失败 MUST 归因到具体 adapter、Skill 和 vendor resource，而不是通用 builtin 合法性

#### Scenario: Skill 未提供 OpenAI metadata
- **WHEN** 面向 Codex 发布的 Skill 包含有效 `SKILL.md` 但没有 `agents/openai.yaml`
- **THEN** Buildr MUST 允许该 Skill 正常发布、投射和发现
- **AND** Buildr MUST NOT 在 render 时生成或反写该 vendor 文件

### Requirement: Skill 执行资源相对于当前 SKILL.md 解析
Buildr builtin Skill MUST 使用相对于当前 runtime `SKILL.md` 所在目录的路径定位执行所需的模板、脚本、references、examples 或其他可移植随附资源，且核心行为 MUST NOT 依赖 vendor metadata 才能执行。

#### Scenario: Skill 使用随附模板
- **WHEN** runtime Skill 正文要求 Agent 从 `assets/` 或 `templates/` 复制模板
- **THEN** Agent MUST 从当前 `SKILL.md` 所在目录解析该相对路径
- **AND** Skill MUST NOT 依赖源 workspace 路径或 `agents/openai.yaml` 定位该模板

### Requirement: Workspace Skills 源资产维护命令
Buildr MUST 只在 workspace 根维护 Skill 源资产、contracts 和默认 bindings，并 MUST 将 Skill source authority 与 runtime destination 分离。

#### Scenario: 装载 workspace 本地 Skill
- **WHEN** Agent 运行 `buildr skills add --source <skill-dir> --target <workspace>`
- **THEN** Buildr MUST 从 `SKILL.md` frontmatter `name` 读取 Skill ID
- **AND** Buildr MUST 将完整受支持目录装载或登记到 `<workspace>/skills/<skill-id>/`
- **AND** Buildr MUST 只更新 `<workspace>/skills/manifest.yml`

#### Scenario: Project scope 不再受支持
- **WHEN** Agent 为 `skills add/remove` 提供 `--scope projects/<project>`
- **THEN** Buildr MUST 拒绝该操作并报告 breaking migration guidance
- **AND** Buildr MUST NOT 写入 Project manifest、源目录或 runtime

#### Scenario: 兼容 workspace scope 表达
- **WHEN** Agent 在迁移期为 `skills add/remove` 提供 `--scope .`
- **THEN** Buildr MUST 将其解析为 workspace source authority并输出 deprecated warning
- **AND** canonical help 和 receipt MUST 省略 source scope 或明确使用 workspace 术语

### Requirement: Skill asset identity 与 runtime name 分离
Buildr MUST 为每个 workspace Skill 保存稳定 `assetIdentity` 和 `sourceIdentity`，同时保持 Skill ID、`SKILL.md` name 与 runtime directory name 一致。

#### Scenario: 同一 manifest entry 内容更新
- **WHEN** 已登记本地 Skill 的受支持内容改变且 manifest entry identity 保持不变
- **THEN** Buildr MUST 将其视为同一 asset identity 的新 source digest
- **AND** Buildr MUST NOT 仅因 digest 改变将其分类为外部同名资产

#### Scenario: 不同实现使用同一 Skill ID
- **WHEN** 候选 Skill 与已有资产使用相同 Skill ID 但 source identity 不同
- **THEN** Buildr MUST 将其分类为名称冲突
- **AND** Buildr MUST 要求候选使用不同 Skill ID 或显式完成 ownership transfer

### Requirement: Skill render destination 明确区分 user 与 workspace
Buildr MUST 支持从同一 workspace Skill authority 向 `user` 或 `workspace` destination 生成 Agent runtime 投射，并 MUST 保持两种 destination 的授权和生命周期独立。

#### Scenario: Render 到 workspace
- **WHEN** Agent 运行 `buildr skills render <agent> --destination workspace --target <workspace>`
- **THEN** Buildr MUST 将 enabled workspace Skills 投射到 adapter 声明的当前工作目录 Skills root
- **AND** Buildr MUST NOT 修改用户级 Skills root

#### Scenario: Render 到 user
- **WHEN** 用户明确要求全局安装且 Agent 运行 `buildr skills render <agent> --destination user --target <workspace>`
- **THEN** Buildr MUST 从目标 workspace 读取 Skill source authority
- **AND** Buildr MUST 将候选投射到 adapter 声明的用户级 Skills root
- **AND** Buildr MUST 写入独立 ownership/projection receipt

#### Scenario: sync 不隐式写用户层
- **WHEN** Agent 运行 `init`、`sync` 或未显式选择 user destination 的组合 `render`
- **THEN** Buildr MUST 只维护 workspace destination
- **AND** Buildr MUST NOT 安装、更新、采用、转移或删除用户级 Skill

### Requirement: Buildr 对候选 Skill 执行冲突治理
Buildr MUST 在 mutation 前根据 Skill ID、asset identity、source identity、ownership 和完整 runtime digest 对候选涉及的有效 Agent Skills 执行冲突分类。

#### Scenario: 同 ID 同一投射
- **WHEN** target 已存在相同 asset identity 和 render digest 的受管 Skill
- **THEN** Buildr MUST 返回 `already_projected`
- **AND** Buildr MUST 保持 Skill 文件幂等零写入

#### Scenario: 同一资产受控更新
- **WHEN** target receipt 证明相同 asset identity、合法 ownership 且候选 digest 已变化
- **THEN** Buildr MUST 将操作分类为 `update`
- **AND** Buildr MUST 使用整包事务更新 Skill 和 receipt

#### Scenario: 同名外部不同内容
- **WHEN** 可观测有效 Skills 集存在相同 Skill ID，但 asset/source identity 或内容与候选不同
- **THEN** Buildr MUST 报告 `skill_name_conflict` 或 `skill_foreign_owner`
- **AND** Buildr MUST 在写入任何候选 runtime 文件前停止整次 mutation

#### Scenario: 同名同内容但无 receipt
- **WHEN** 可观测目标存在同名同内容 Skill 但 Buildr 无法证明 asset identity 和 ownership
- **THEN** Buildr MUST 报告 `skill_equivalent_external`
- **AND** Buildr MUST NOT 自动取得更新或卸载权

#### Scenario: 不相关的外部重复 Skill
- **WHEN** 有效 Skills 集存在外部重复 ID，但本次 mutation 没有该 ID 的候选
- **THEN** doctor MAY 报告 warning
- **AND** Buildr MUST NOT 仅因该不相关重复阻止本次 mutation

### Requirement: 同一 Buildr Skill 不重复进入有效发现集合
Buildr MUST 保证同一 Agent 当前 workspace 的可观测有效发现集合中，同一 Buildr asset identity 最多存在一个 active projection。

#### Scenario: 用户层已经满足 workspace Skill
- **WHEN** workspace render 发现用户层已有相同 asset identity 和 render digest
- **THEN** Buildr MUST 返回 `satisfied_by_user` 并记录 satisfaction evidence
- **AND** Buildr MUST NOT 创建重复 workspace Skill 目录

#### Scenario: 用户层与 workspace 层需要同名不同版本
- **WHEN** user 与 workspace destination 解析到相同 Skill ID 但不同 render digest
- **THEN** Buildr MUST 报告 blocking conflict
- **AND** nextActions MUST 要求统一版本、移除其中一个投射或为变体使用不同 Skill ID

### Requirement: Project Skill 源资产迁移保持保守和可恢复
Buildr MUST 提供 legacy Project Skill migration check/apply，使历史 Project Skill sources 收敛到 workspace authority，且无法无歧义合并时 MUST 保留现场。

#### Scenario: Legacy Project 独有 Skill
- **WHEN** legacy Project manifest 的 Skill ID 不存在于 workspace manifest
- **THEN** migration plan MUST 将该 Skill 移动或登记为 workspace Skill
- **AND** MUST 在 Project capability context 中保留 applicability

#### Scenario: Workspace 与 legacy Project Skill 等价
- **WHEN** legacy Project Skill 与 workspace Skill 的 identity/content 可证明等价
- **THEN** migration plan MUST 去重 Project 副本并创建逻辑引用
- **AND** MUST NOT 改变 workspace canonical Skill 内容

#### Scenario: Workspace 与 legacy Project Skill 同名不同内容
- **WHEN** legacy Project Skill 与 workspace Skill ID 相同但内容或来源不同
- **THEN** Buildr MUST 报告 `project_skill_name_conflict`
- **AND** migration apply MUST 零写入，直到用户选择重命名、canonical 版本或放弃迁移

#### Scenario: Migration apply 失败
- **WHEN** migration 在 workspace manifest、Project context、源目录或最终 doctor 任一步失败
- **THEN** Buildr MUST 恢复事务前状态并保留 recovery evidence
- **AND** Buildr MUST NOT 删除 legacy Project Skill 源

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

### Requirement: runtime Skill 的 adapter context 不得声明读取者身份
Buildr 向 runtime `SKILL.md` 注入 adapter context 时 MUST 将其限制为投射或消费所需的非身份事实，并 MUST NOT 把投射 adapter 声明为当前读取者或需要 `<agent>` 的操作默认值。

#### Scenario: 多个 Agent 能发现同一 Skill root
- **WHEN** 一个 runtime Skill 目标目录可能被投射 adapter 之外的 Agent 发现
- **THEN** 该 Skill 的执行正文 MUST 保持对读取者身份中立
- **AND** adapter-specific 投射 identity MUST 继续保存在 Doctor 或 receipt 等机器证据中

#### Scenario: 产品入口 Skill 投射到不同 runtime root
- **WHEN** Buildr 为任一 supported adapter 生成产品入口 Buildr Skill
- **THEN** 生成的 `SKILL.md` MUST NOT 包含“当前 Agent Adapter”、当前安装 adapter 声明或固定 adapter 维护命令
- **AND** 各 adapter 的 runtime root、activation 和 checker MUST 继续由 adapter registry 决定
