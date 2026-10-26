## MODIFIED Requirements

### Requirement: package check 覆盖 manifest-backed 资产维护命令
Buildr package check MUST 验证 manifest-backed 资产维护命令不会破坏默认 workspace baseline、manifest 标准格式或 runtime 投射边界，并 MUST 验证已退役 Rule 命令不写文件。

#### Scenario: 验证命令行工具 add/remove
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 验证 `commands add/remove` 可以在已初始化临时 workspace 中维护 `commands/manifest.yml`
- **AND** Buildr MUST 验证写回后的命令行工具条目使用 `installHint` 而不是 `install`
- **AND** Buildr MUST 验证 `commands add/remove` 不会自动安装命令行工具或写入 Agent runtime

#### Scenario: 验证 Skills add/remove
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 验证 `skills add/remove` 只维护已初始化临时 workspace 根的 `skills/manifest.yml`
- **AND** Buildr MUST 验证 Project source scope 被拒绝并返回 legacy migration guidance
- **AND** Buildr MUST 验证 `skills add --source` 装载的是完整 Skill 源目录
- **AND** Buildr MUST 验证 `skills add/remove` 不会自动写入 user 或 workspace runtime destination

#### Scenario: 验证 Rules add/remove
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 验证 `rules add` 与 `rules remove` 返回非零状态和退役迁移指引
- **AND** Buildr MUST 验证这两个命令不会创建或修改 `rules/manifest.yml`、`rules/*.md` 或 Agent runtime
- **AND** Buildr MUST 验证 `rules render` 仍可用于 `AGENTS.md` 入口投射

### Requirement: 产品 MVP 验证覆盖 manifest-backed 资产维护
Buildr 产品 MVP 验证 MUST 覆盖命令行工具与 Skills 源资产维护命令的主要用户路径，以及 Rule 命令退役路径。

#### Scenario: MVP 验证新增源资产
- **WHEN** Agent 运行产品 MVP 验证脚本
- **THEN** 验证脚本 MUST 覆盖 `commands add/remove`
- **AND** 验证脚本 MUST 覆盖 `skills add/remove`
- **AND** 验证脚本 MUST 覆盖 `rules add/remove` 返回退役诊断且不写文件
- **AND** 验证脚本 MUST 覆盖 add/remove 后通过 check、doctor 或 render/check 继续确认状态的路径

#### Scenario: MVP 验证边界
- **WHEN** Agent 运行产品 MVP 验证脚本
- **THEN** 验证脚本 MUST 覆盖 add/remove 要求 target 已初始化
- **AND** 验证脚本 MUST 覆盖 add/remove 不提供 `--json`
- **AND** 验证脚本 MUST 覆盖 add/remove 不硬编码特定 Agent adapter 的下一步命令

#### Scenario: 临时 workspace 端到端验收
- **WHEN** Agent 运行产品 MVP 验证脚本
- **THEN** 验证脚本 MUST 从空临时目录初始化真实 Buildr workspace
- **AND** 验证脚本 MUST 确认初始化结果不包含 `rules/` 目录或 `rules/manifest.yml`
- **AND** 验证脚本 MUST 按 Workspace、Project、Service、Commands、Skills、Runtime 六类资产覆盖主要 Agent 操作路径
- **AND** 验证脚本 MUST 在每类资产关键状态变更后使用 `doctor --json` 或对应专项检查确认状态

### Requirement: package manifest 声明内置能力
Buildr package manifest MUST 声明可同步到用户 workspace 的产品内置 Skills、Commands 和 Skill capability contracts，并提供旧 workspace 安全采用所需的官方完整性证据。Capability retirement entry MAY declare `legacyIntegrities`，用于登记已由产品发布过的历史 contract bytes；该白名单 MUST 只接受显式、可审计的 SHA-256 值。

#### Scenario: 声明内置 Rules
- **WHEN** Buildr package manifest 包含 `builtins.rules` 或尝试发布 `rules/buildr/` 内置 Rule 资产
- **THEN** `buildr package check` MUST 失败并指出 Rule 内置能力已退役
- **AND** Buildr MUST NOT 安装、同步或登记任何内置 Rule

#### Scenario: 声明内置 Skills
- **WHEN** Buildr package 包含产品内置 Skills
- **THEN** `package/manifest.yml` MUST 声明每个内置 Skill 的 id、源路径、目标路径和 required 状态；省略 runtimes MUST 表示通用适用，显式列表 MUST 表示对真实运行时身份的限制
- **AND** composed Skill MUST additionally declare its `provides` and `requires` capability identities、versions and dependency modes
- **AND** version 或 hash 元数据 MAY 声明，但不是必填

#### Scenario: 发布工作能力适配 Skill
- **WHEN** Buildr package 发布 `capability-adaptation`
- **THEN** 该 Skill MUST 作为 optional 管理 Skill 随 workspace sync 投射到全部 supported runtimes
- **AND** 其 description MUST 覆盖采用内部流程、调整工作方式、修改或替换 Skill 行为等自然语言意图
- **AND** 该 Skill MUST NOT 为自身声明空洞 capability contract

#### Scenario: 声明内置 capability contracts
- **WHEN** Buildr package publishes builtin providers or consumers
- **THEN** `package/manifest.yml` MUST declare each referenced contract id、version、description and source path
- **AND** package metadata MUST identify initial default bindings without making provider Skill ids part of the contract identity
- **AND** package check MUST validate contract frontmatter、fixed semantic sections and manifest identity consistency

#### Scenario: 未声明版本的内置能力
- **WHEN** 某个内置能力未声明 version 或 hash
- **THEN** Buildr doctor MUST 仍使用安装回执检查该内置能力的精确 live 状态
- **AND** Buildr MUST NOT 仅因为没有独立 assets version 输出 warning

#### Scenario: 声明内置 Commands
- **WHEN** Buildr package 包含产品内置 Commands
- **THEN** `package/manifest.yml` MUST 声明每个内置 Command 在 `commands/manifest.yml` 中需要写入的 manifest entry
- **AND** 内置 Commands MUST 保持为声明和安装提示，不得变成自动本机安装

#### Scenario: 声明 legacy 官方完整性
- **WHEN** Buildr 需要让旧 workspace 安全退休历史 capability contract
- **THEN** retirement entry MUST 保留当前 `integrity` 并 MAY 声明 `legacyIntegrities`
- **AND** 每个 legacy integrity MUST 是随既有 Buildr package 发布过的官方 contract bytes 的 SHA-256
- **AND** legacy integrity MUST 只用于证明官方历史内容，不得作为未知用户修改的通配绕过

#### Scenario: package check 校验内置能力
- **WHEN** Agent 运行 `buildr package check`
- **THEN** Buildr MUST 校验已声明的内置能力源路径
- **AND** Buildr MUST 校验 forbidden patterns、必需 Skill 文件、manifest entry 结构、目标路径安全性、legacy integrity 格式及身份唯一性
- **AND** Buildr MUST 校验每个 `legacyIntegrities` 是有效 SHA-256、与当前 integrity 不重复且在同一 retirement entry 内不重复
- **AND** Buildr MUST validate every contract reference、initial default binding、provides/requires version and dependency mode

#### Scenario: 旧 workspace 使用已知历史 contract
- **WHEN** sync 读取 retirement target，文件 hash 等于当前 `integrity` 或该 entry 声明的 `legacyIntegrities`
- **THEN** Buildr MUST 将文件识别为可安全退休的受管官方内容
- **AND** MUST 按 retirement plan 移除受管旧 contract/provider/binding source
- **AND** MUST 不读取、覆盖或删除 `.buildr/asset-review/` observation/history 数据

#### Scenario: 未知 contract drift 继续阻塞
- **WHEN** sync 读取 retirement target，文件存在但 hash 不等于当前 `integrity` 或任一 `legacyIntegrities`
- **THEN** Buildr MUST 返回 capability retirement drift 并 fail closed
- **AND** MUST 在 source mutation、retirement deletion 和 runtime projection 前停止

#### Scenario: Rules 和 Skills manifest-first
- **WHEN** Buildr package 发布内置 Skills
- **THEN** sync MUST 将它们登记到 `skills/manifest.yml`
- **AND** Buildr MUST NOT 创建 `rules/manifest.yml` 或登记内置 Rules
- **AND** Buildr MUST NOT 依赖扫描裸文件决定技能或 capability bindings 是否生效

#### Scenario: Rule manifest metadata
- **WHEN** Buildr 创建、安装或更新 Rule 资产
- **THEN** Buildr MUST NOT 写入或要求 `rules/manifest.yml` entry metadata
- **AND** 已退役 Rule manifest 中的 `id`、`source`、`path`、`description`、`enabled` 和 `required` MUST NOT 参与当前 Rule 消费
- **AND** 需要长期生效的规则正文 MUST 由对应 `AGENTS.md` 承载

#### Scenario: package baseline 排除未声明内置能力
- **WHEN** Buildr 打包或校验产品资产
- **THEN** builtin package 源目录下的文件 MUST 只有在 package manifest 声明或被 package include 边界覆盖时才能进入发布包

### Requirement: 场景化内置流程以 Skills 发布
Buildr package assets MUST 将由任务意图触发的场景化流程指引发布为内置 Skills，不得发布任何内置 Rules。

#### Scenario: package 声明场景化流程指引
- **WHEN** Buildr package 包含需要按任务意图、工作流阶段、风险条件或命令流程判断是否适用的指引
- **THEN** `package/manifest.yml` MUST 将该指引声明为内置 Skill
- **AND** 对应默认 workspace baseline MUST 在 `skills/manifest.yml` 中登记该 Skill
- **AND** Buildr MUST NOT 将该指引发布为内置 Rule

#### Scenario: package 声明 invariant 指引
- **WHEN** Buildr package 包含定义 workspace 模型、源资产边界、必读入口或常驻 invariant 的指引
- **THEN** 该指引 MUST 位于根 `AGENTS.md` 受管区块
- **AND** Buildr MUST NOT 将其发布为独立内置 Rule 文件

### Requirement: 默认 baseline 排除场景化 Rules
Buildr package baseline MUST 不发布任何内置 Rules 资产，也不得把任务分流、OpenSpec 工作流、worktree 工作流或 Git 操作流程作为内置 Rules 发布。

#### Scenario: package check 校验 baseline Rules
- **WHEN** Agent 运行 `buildr package check`
- **THEN** 如果 package manifest 声明 `builtins.rules` 或默认 package baseline 包含 `rules/buildr/*.md`，Buildr MUST 校验失败
- **AND** invariant 指引 MUST 由根 `AGENTS.md` 提供
- **AND** 任务触发型指引 MUST 可通过内置 Skills 获得

### Requirement: Required Core 暴露 Rule 消费协议
Buildr package assets MUST 将基于 `AGENTS.md` 层级的规则消费协议与通用 Rule/Skill 权威边界保留在根 `AGENTS.md` 受管区块中（原核心规则，下文沿用 Core 名称），同时 MUST 将 task-triggered professional procedures 和专业状态事实保留在对应 Skills、capability bindings、Applications 或 Project declarations 中。

#### Scenario: Package Core 声明 Rule 状态语义
- **WHEN** Buildr packages or validates 根 `AGENTS.md` 受管区块
- **THEN** required Core MUST state that Agent reads all applicable `AGENTS.md` from the organization root to the current target path
- **AND** required Core MUST state that broader scope is applied before more specific scope and unrelated sibling directories are not read
- **AND** required Core MUST NOT require or describe `rules/manifest.yml`、enabled、required、state 或 description 索引

#### Scenario: Package Core 限定 scope Rules 内容
- **WHEN** required Core 说明 root、Project 或 Service `AGENTS.md` 可以增加的 scope-specific 内容
- **THEN** Core MUST 将其限制为价值观、权威边界、授权边界、约束和结果不变量
- **AND** Core MUST NOT 让这些 Rules 承担 Skill routing、命令序列、生命周期步骤、重跑/恢复策略、报告模板或专业 Result/status 副本

#### Scenario: Rule 只声明专业 owner
- **WHEN** root、Project 或 Service Rule 需要约束某项专业动作不得被绕过
- **THEN** required Core MUST allow the Rule to name the owning Skill、capability、Application or declaration and state the no-bypass invariant
- **AND** Skill description MUST remain the user-intent discovery authority
- **AND** capability binding MUST remain the provider-selection authority
- **AND** the owning Skill/Application MUST remain the procedure and professional-result authority
- **AND** the Rule MUST NOT copy that owner's playbook or current state

#### Scenario: Package Core 不承载操作手册
- **WHEN** Buildr packages Rule consumption guidance
- **THEN** required Core MUST NOT copy task-specific Git、OpenSpec、worktree or other operational procedures
- **AND** required Core MUST NOT state that Project or Service Rules may own concrete task procedures
- **AND** reusable task procedures MUST remain available through the corresponding Skills

### Requirement: Package manifest 声明 workspace Components
Buildr package manifest MUST 显式声明随包 workspace Components，并将 Component 定义、外部 Skill resolved sources 和 Buildr-owned member sources 限制在可验证的发布边界内。

#### Scenario: 声明随包 Component
- **WHEN** Buildr 产品包提供 workspace Component
- **THEN** `package/manifest.yml` MUST 声明 Component id、定义源路径、默认启用状态和 required 状态
- **AND** Component 定义源 MUST 位于 `package/targets/workspace/components/<source>/<id>/component.yml`

#### Scenario: Component 定义引用不同来源成员
- **WHEN** 随包 Component 声明外部 Skills、Buildr-owned Skills、Command collections 或 Skill Contributions
- **THEN** 每个 Buildr-owned member 源和目标路径 MUST 位于允许的 workspace target 边界
- **AND** 每个外部 Skill MUST 声明可验证的 source、resolved source、version 和 integrity
- **AND** Component 定义 MUST 声明全部物化成员 integrity
- **AND** 同一个随包成员 MUST NOT 被多个 Component 声明生命周期所有权

#### Scenario: Component 非空 members.rules 退役
- **WHEN** 随包 Component 定义声明非空 `members.rules`
- **THEN** `buildr package check` MUST 失败并给出迁移到 `AGENTS.md` 的指引
- **AND** 空 `members.rules` MAY 被容忍且 MUST NOT 物化为成员或写入 Rule manifest

#### Scenario: Package check 校验 Component
- **WHEN** Agent 运行 `buildr package check`
- **THEN** Buildr MUST 校验 Component manifest schema、定义 schema、稳定 id、版本、来源、成员路径、成员存在性和 integrity
- **AND** Buildr MUST 校验外部 Skill 内容未包含 Buildr sidebar 修改
- **AND** Buildr MUST 校验 Component 与独立 Builtins、workspace baseline 和其他 Components 不存在 id、路径或 ownership 冲突

#### Scenario: OpenSpec Component 上游版本对齐
- **WHEN** package check 校验随包 OpenSpec Component
- **THEN** Buildr MUST 校验 OpenSpec Command collection 和全部声明的外部 workflow Skills 存在
- **AND** Buildr MUST 校验外部 Skills 的 `generatedBy`、resolved source 和 integrity 与 Component 声明的 OpenSpec 上游版本一致
- **AND** Buildr MUST 校验 sidebar 对该上游版本兼容

#### Scenario: Component 不重复进入 baseline 映射
- **WHEN** package manifest 已通过 Component 声明某个 Skill 或 Command collection
- **THEN** Buildr MUST NOT 再依赖重复的 workspace baseline 文件清单决定该成员的安装状态
- **AND** init/update MUST 通过 Component 生命周期物化该成员

### Requirement: 初始化必须从 resources manifest 映射生成
Buildr MUST 从 `resources/manifest.yml` 的产品声明和内容映射生成默认 root/Project 内容，并 MUST 通过 canonical Domain writer 生成 Workspace、Project 与 Service 的持久化配置。

#### Scenario: 渲染 root baseline
- **WHEN** Agent 执行 `buildr init --target <dir> --name <name>`
- **THEN** Buildr MUST 使用 resources manifest 的 Workspace mappings 生成 Skill、Command、Component、AGENTS 与 Git 模板等内容资产
- **AND** Buildr MUST NOT 生成 `rules/` 目录或 `rules/manifest.yml`
- **AND** Buildr MUST 通过 canonical writer 生成全部持久化配置
- **AND** Buildr MUST NOT 读取旧 package Workspace target

### Requirement: 唯一内联核心规则源
Buildr MUST 只在随包工作空间 `AGENTS.md` 受管区块维护核心规则正文，保留已确认六条智能体优先原则的实质内容，新增以产物为核心组织协作的产品原则，并保留授权、真实事实、用户沟通、工作资产职责及产品边界。实现和适配器 MUST 消费该来源，不复制正文或继续要求独立 Core 文件。规则 MUST 区分智能体参与工作协作与参与产品交付的适用范围；未引入智能体的产品或功能不自动采用智能体优先架构，渐进引入时应用于相关部分。多入口原则 MUST 要求变化可发现、继续相关工作时核对当前事实并显式处理版本冲突；不固定通知技术或要求每次变化立即唤醒智能体。

#### Scenario: 发布与诊断消费同一规则源
- **WHEN** 初始化、同步、更新或诊断工作空间
- **THEN** 系统 MUST 使用同一随包区块生成或比较完整正文，而非仅检查旧文件引用
- **AND** 发布物 MUST NOT 包含独立 `rules/buildr/core.md`、其他 `rules/buildr/` 内置 Rule 资产或 `builtins.rules` 声明

#### Scenario: 工作空间承载普通业务软件
- **WHEN** 智能体帮助开发未引入智能体交付产品结果的软件
- **THEN** 规则 MUST 约束智能体的工作协作，但不得仅因开发方式要求业务产品采用智能体优先架构
- **AND** 既有业务规则、安全及授权边界 MUST 保留

#### Scenario: 多入口接续产物
- **WHEN** 人或智能体从一个入口修改产物，其他入口继续相关工作
- **THEN** 规则 MUST 要求变化可被发现，继续判断或修改前核对当前事实，写入时保护已观察版本并显式处理冲突
- **AND** 规则 MUST 将成果一致与目标验收区分，不把对话或一次执行作为唯一权威

### Requirement: Buildr 自举 Component 必须统一执行自举激活
Buildr自举Workspace的`buildr-self-bootstrap` Component MUST通过单一专属Skill执行self-bootstrap activation。该Skill MUST消费真实基线、真实Git交付、delivered ref、retained checkout、Product Node与当前变化范围，按需组合package sync、development Buildr Web安装、开发入口验证与最终Doctor；Task编号MAY作为可选说明，但MUST NOT要求Task存在或已完成。MUST不读取旧Finish run、Task Contribution、Environment Receipt或resume token，也不安装或验证PATH默认development CLI。

#### Scenario: 普通源码或文档变化
- **WHEN** 当前真实变化未命中规则、技能、组件、命令、package、CLI或Buildr Web实际影响路径
- **THEN** self-bootstrap activation MUST返回`not-applicable`
- **AND** MUST不执行sync、Buildr Web安装或PATH CLI mutation

#### Scenario: 自举动作适用
- **WHEN** delivered ref由目标本地及远端分支持有且真实变化命中自举范围
- **THEN**唯一runner MUST执行适用动作并通过retained `projects/product/buildr`验证入口与最终Doctor
- **AND** 失败 MUST形成Activation Attention且不撤销Git交付或Task结果

#### Scenario: 无任务记录或任务尚未完成
- **WHEN** 真实变化命中自举范围，交付、目录和版本检查通过，且未提供Task编号或提供了尚未完成任务的编号
- **THEN** runner MUST执行适用动作，不查询、创建或修改Task记录

#### Scenario: 无任务自举推送失败后恢复
- **WHEN** 同一基线、交付、目标和宿主产生的单父后继提交尚未推送
- **THEN** runner MUST只恢复该后继推送，不重复同步或创建提交
- **AND** 其他基线、目标或未授权后继MUST保留并拒绝认领

#### Scenario: 规则与组件变化需要投射
- **WHEN** 已交付变化涉及根或项目/服务 `AGENTS.md`、skills、components 或 commands
- **THEN** runner MUST执行适用sync并验证开发入口与最终Doctor
- **AND** 已退役 `rules/` 资产 MUST NOT 被当作当前同步源资产

### Requirement: 软件包检查必须按四类及实际行为边界拆分
Buildr MUST 将 package 静态内容校验、软件包工作空间端到端检查（E2E） 和领域 integration 实现为可独立执行的 verifier，并 MUST 让 `buildr package check` 聚合这些 verifier 的结果而不改变公开成功或失败语义。

#### Scenario: 维护者运行 package check
- **WHEN** 维护者运行 `buildr package check`
- **THEN** 命令 MUST 执行全部已登记 package verifier
- **AND** 任一 verifier 失败 MUST 使聚合命令返回非零状态并标识失败边界

#### Scenario: package 静态校验独立执行
- **WHEN** Candidate 或 affected 验证执行 package static verifier
- **THEN** verifier MUST 校验 manifest、inventory、随包 baseline、Skill/Component 内容契约和必要支持工具
- **AND** verifier MUST NOT 创建临时用户 workspace 或执行领域 CLI 生命周期

#### Scenario: 软件包工作空间端到端检查（E2E） 独立执行
- **WHEN** Candidate 或维护者执行 软件包工作空间端到端检查（E2E）
- **THEN** verifier MUST 验证 init 生成的随包 baseline、现有 `AGENTS.md` 兼容和最终 doctor 收敛
- **AND** verifier MUST NOT 重复 Commands、Skills 或全部 runtime adapter 的细粒度 CRUD 与投射矩阵

#### Scenario: 领域 integration 独立执行
- **WHEN** package 验证需要覆盖 Commands、Skills 或 runtime 的行为契约
- **THEN** 对应断言 MUST 由稳定的 focused verifier identity 持有
- **AND** package check MAY 聚合该 verifier，但 软件包工作空间端到端检查（E2E） MUST NOT 复制其完整场景
