## MODIFIED Requirements

### Requirement: Runtime 投射按 Agent 能力选择
Buildr MUST 将支持的 Agent runtime 视为从 Buildr 源资产、canonical scope discovery plan 和已启用内置能力生成的 adapter 投射。

#### Scenario: Codex runtime 投射
- **WHEN** Buildr 渲染 Codex adapter
- **THEN** Buildr MUST 保持 discovered `AGENTS.md` files 作为 Codex 原生规则入口
- **AND** Buildr MUST NOT 为 Rules 写入 Codex bridge 文件
- **AND** Buildr MUST 将适用的已渲染 Skills 安装到当前 Codex 打开工作目录的 `.agents/skills/`
- **AND** Buildr MUST 将 `.agents/skills/` 视为 workspace destination 投射产物，而不是长期 Buildr 源资产

#### Scenario: Claude Code runtime 投射
- **WHEN** Buildr 渲染 Claude Code adapter
- **THEN** Buildr MUST 为 discovery plan 中每个 `AGENTS.md` 写入或更新同目录 `CLAUDE.md` 引用桥
- **AND** Buildr MUST 将适用的已渲染 Skills 安装到当前工作目录的 `.claude/skills/`
- **AND** Buildr MUST 将 `CLAUDE.md` 和 `.claude/skills/` 视为 workspace destination 投射产物，而不是长期 Buildr 源资产

#### Scenario: 支持的 adapters
- **WHEN** Buildr syncs or renders Agent runtime
- **THEN** Buildr MUST 支持标准适配器（Adapter）`agents-standard`，并将 `codex`、`dsh` 及没有专用例外的有效运行时标识解析到标准；`claude-code` 等已知专用接入继续使用专用实现
- **AND** Buildr MUST 清楚报告非法运行时标识或显式不存在的适配器（Adapter），且不得修改 runtime 文件

#### Scenario: Runtime 准备顺序
- **WHEN** Buildr 渲染 Agent runtime
- **THEN** Buildr MUST 通过 `AGENTS.md` discovery plan 暴露和检查适用规则
- **AND** Buildr MUST NOT 读取 `rules/manifest.yml` 或其他 Rule manifest 来决定 runtime 规则
- **AND** Buildr MUST 按 workspace `skills/manifest.yml` 投射 enabled skills
- **AND** Buildr 内置项 MUST 在 manifest 中排在用户项之前
- **AND** rule discovery plan MUST order ancestor sources before descendant sources
- **AND** 在处理 Project scope 时，Buildr MUST 在 workspace 资产之后处理 Project 用户规则资产
- **AND** 更具体的源资产 MUST 在 Agent 可读入口中更靠后出现

#### Scenario: Rules 语义索引读取
- **WHEN** Agent 进入 Buildr workspace scope
- **THEN** Agent MUST 先读取实际存在且适用的 `AGENTS.md`，不要求根文件或 Buildr 默认区块
- **AND** Agent MUST 按由宽到窄的顺序读取从组织根到当前目标路径之间所有存在的 `AGENTS.md`
- **AND** Agent MUST 根据用户目标、修改范围、代码语义和 workspace context 判断是否读取相关子目录的 `AGENTS.md`
- **AND** Agent MUST NOT 读取不相关兄弟目录的规则
- **AND** Agent MUST NOT require `rules/manifest.yml` 或结构化 role、path、service、directory routing tables

#### Scenario: Rule 和 Skill 加载语义
- **WHEN** Buildr exposes Rules and Skills to an Agent runtime
- **THEN** Buildr MUST distinguish Rules and Skills by asset semantics rather than by whether they are always loaded
- **AND** Buildr MUST treat Rules as values, boundaries, and constraints
- **AND** Buildr MUST treat Skills as reusable professional actions and procedures

#### Scenario: Rule manifest 状态消费
- **WHEN** Agent 在 Buildr workspace 中执行工作
- **THEN** Agent MUST 在执行前读取当前目标路径适用的全部 `AGENTS.md`
- **AND** Agent MUST 在修改目录或文件时读取该路径新增的更深层 `AGENTS.md`
- **AND** 已退役 `rules/manifest.yml` 中的 entry MUST NOT 参与当前任务
- **AND** adapter discovery MUST NOT decide semantic Rule relevance on behalf of the Agent

#### Scenario: 根 sync 递归投射
- **WHEN** Agent runs `buildr sync <agent> --target <root>` without an explicit scope
- **THEN** Buildr MUST use canonical scope `.`
- **AND** Rules projection MUST reconcile all supported `AGENTS.md` in the managed workspace subtree
- **AND** native adapters MUST perform no Rules writes

#### Scenario: 深层 Rules scope 与 Skills source 分离
- **WHEN** Agent renders a Service or deeper canonical scope through the combined `buildr render` command
- **THEN** Rules discovery MUST use the full canonical scope
- **AND** Skills resolution MUST use the workspace source authority only
- **AND** Buildr MUST NOT infer Service-level Skill source support

#### Scenario: Render conflict is validated before writes
- **WHEN** any planned rendered Rules target conflicts with a non-Buildr-managed runtime file
- **THEN** Buildr MUST fail before writing any planned Rules target
- **AND** Buildr MUST report every detected conflict in the selected scope

#### Scenario: Orphan managed bridge cleanup
- **WHEN** a selected scope contains a Buildr-managed rule bridge whose same-directory `AGENTS.md` no longer exists
- **THEN** rendered adapter reconcile MUST remove the orphan bridge
- **AND** Buildr MUST NOT remove non-Buildr-managed runtime files

### Requirement: Skills runtime 区分产品内置 Skill 与 workspace Skill
Buildr runtime projection MUST 区分产品内置 Agent Skills 与 workspace Skill source，并 MUST 将写入 user/workspace destination 的内容视为可重建 runtime 投射产物；Project MUST NOT 构成 Skill source、安装或可见性隔离层。

#### Scenario: 安装产品内置 Skill
- **WHEN** 当前 Agent runtime 支持 Skills 且 Buildr package manifest 声明了适用的产品内置 Agent Skill
- **THEN** `buildr skill install <agent>` MUST 将该 Skill 安装或修复到目标 Agent runtime
- **AND** `buildr skills render <agent>` MUST NOT 安装或修复该产品内置 Skill

#### Scenario: 保持 workspace Skill 解析
- **WHEN** workspace 根定义了 `skills/manifest.yml`
- **THEN** `buildr skills render <agent>` MUST 从工作空间采用清单解析 enabled Skills，官方引用从已采用共享资源集读取，组织自有内容从本地源读取
- **AND** Buildr MUST NOT 消费 Project `capabilities.yml` 的 requirements、bindings 或 applicability
- **AND** Buildr MUST 根据 manifest 条目的本地源、远端 resolved 状态和 install mode 选择 render 方式

#### Scenario: 渲染本地作者型 Skill
- **WHEN** Skill manifest 条目使用 `path` 且没有官方 `resource` 引用
- **THEN** `buildr skills render <agent>` MUST 从 workspace `skills/<skill-id>/SKILL.md` 读取源内容
- **AND** Buildr MUST 将该 Skill 投射到显式选择的 user 或 workspace destination

#### Scenario: 渲染已解析远端 Skill
- **WHEN** Skill manifest 条目包含 `resolved`
- **AND** install mode 是 `buildr`
- **THEN** `buildr skills render <agent>` MUST 从 resolved 精确安装源拉取 Skill 内容
- **AND** Buildr MUST 支持 `resolved.kind: skill-url`，其中 URL 内容是 raw `SKILL.md`
- **AND** 当 resolved kind 不受当前 CLI 支持时 Buildr MUST 报告错误
- **AND** Buildr MUST 在可用时校验 version 或 integrity
- **AND** Buildr MUST 将该 Skill 投射到显式选择的 destination

#### Scenario: 渲染未解析远端信息源
- **WHEN** Skill manifest 条目只有 `source` 或 install mode 是 `agent`
- **THEN** `buildr skills render <agent>` MUST NOT 将该 Skill 视为已安装
- **AND** Buildr MUST 生成 Buildr managed 的 Agent-readable 安装说明或安装任务
- **AND** 该说明 MUST 包含 manifest 中可用的 source/resolved 信息、Skill id、workspace source 和目标 Agent runtime
- **AND** 该说明 MUST 要求 Agent 阅读 source/resolved 信息、解析精确安装源或按来源指引安装到 Agent runtime

#### Scenario: runtime check 标识 Agent action
- **WHEN** Skill manifest 条目需要 Agent 安装或解析
- **THEN** runtime check 或 doctor MUST 报告该 Skill 需要 Agent action
- **AND** 该状态 MUST NOT 被计为 up to date
- **AND** 诊断结果 MUST 提供下一步建议

#### Scenario: 远端 resolved 缺少 integrity
- **WHEN** Skill manifest 条目包含 resolved 远端安装源
- **AND** manifest 没有声明 integrity
- **THEN** runtime check 或 doctor MUST 报告 warning
- **AND** warning MUST NOT 阻止 render，除非当前 policy 要求完整校验

#### Scenario: runtime 投射不是源资产
- **WHEN** Buildr 将产品内置 Agent Skill 或 workspace Skill 写入 user/workspace destination
- **THEN** 写入结果 MUST 被视为 runtime 投射产物
- **AND** Agent MUST NOT 将写入结果作为 Buildr 产品 Skill 或 workspace Skill 的源资产维护

#### Scenario: 渲染共享官方技能
- **WHEN** 空间清单使用官方 `resource` 引用
- **THEN** MUST 从已校验共享资源集读取完整源和附件，并按当前空间选择生成入口，MUST NOT 按同名目录猜测来源
