## MODIFIED Requirements

### Requirement: package manifest 声明内置能力
Buildr package manifest MUST 声明可同步到用户 workspace 的产品内置 Rules、Skills、Commands 和 Skill capability contracts，并提供旧 workspace 安全采用所需的官方完整性证据。Capability retirement entry MAY declare `legacyIntegrities`，用于登记已由产品发布过的历史 contract bytes；该白名单 MUST 只接受显式、可审计的 SHA-256 值。

#### Scenario: 声明内置 Rules
- **WHEN** Buildr package 包含产品内置 Rules
- **THEN** `package/manifest.yml` MUST 声明每个内置 Rule 的 id、源路径、目标路径、description 和 required 状态
- **AND** version 或 hash 元数据 MAY 声明，但不是必填

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
- **WHEN** Buildr package 发布内置 Rules 或 Skills
- **THEN** sync MUST 将它们登记到 `rules/manifest.yml` 或 `skills/manifest.yml`
- **AND** Buildr MUST NOT 依赖扫描裸文件决定规则、技能或 capability bindings 是否生效

#### Scenario: Rule manifest metadata
- **WHEN** Buildr 创建、安装或更新 Rule manifest entry
- **THEN** entry MUST 声明 `id`、`source`、`path`、`description`、`enabled` 和 `required`
- **AND** `description` MUST 描述适用场景和用途，供 Agent 判断何时读取该规则
- **AND** `description` MUST NOT 用来承载规则正文

#### Scenario: package baseline 排除未声明内置能力
- **WHEN** Buildr 打包或校验产品资产
- **THEN** builtin package 源目录下的文件 MUST 只有在 package manifest 声明或被 package include 边界覆盖时才能进入发布包

### Requirement: Buildr package 必须发布用户体验设计法则内置技能
Buildr package manifest MUST 将 `ux-design-laws` 声明为无 capability contract 的可选内置 Skill，使用 `resources/workspace/skills/buildr/ux-design-laws` 作为完整源目录、`skills/buildr/ux-design-laws` 作为 Workspace target，并投射到全部受支持的 Agent runtime。

#### Scenario: package 声明用户体验设计法则技能
- **WHEN** Buildr package 加载 builtin Skill manifest
- **THEN** `ux-design-laws` MUST 声明 source path、target、与 Skill frontmatter 完全一致的 description、`required: false`，并通过省略 runtimes 表达运行时无关的通用适用性
- **AND** 它 MUST 不声明 `provides`、`requires`、capability contract 或 initial binding

#### Scenario: Workspace baseline 包含完整技能目录
- **WHEN** Buildr 初始化或同步 Workspace 内置资产
- **THEN** Workspace 文件映射 MUST 包含 `ux-design-laws` 的 `SKILL.md`、`agents/openai.yaml`、法则索引和全部五个分组参考文件
- **AND** 随附文件 MUST 保持源目录相对结构并按 package Skill 完整目录规则参与 runtime 投射

#### Scenario: package check 验证用户体验设计法则技能
- **WHEN** Agent 运行 Buildr package check 或对应内置技能契约测试
- **THEN** 验证 MUST 确认 manifest/source/target/description/runtime 一致、30 个主题完整、参考文件可达且没有未完成脚手架
- **AND** 验证 MUST 确认 `ux-design-laws` 不生成原型、不修改代码、不依赖 `ui-prototype` capability，并保留心理学法则的证据、验证和非操纵性边界
