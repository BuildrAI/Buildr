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
- **AND** 在处理 Project scope 时，Buildr MUST 在 workspace 资产之后处理 Project 用户资产与 capability/applicability context
- **AND** 更具体的源资产 MUST 在 Agent 可读入口中更靠后出现

#### Scenario: Rules 语义索引读取
- **WHEN** Agent 进入 Buildr workspace scope
- **THEN** Agent MUST 先读取适用的 `AGENTS.md`，其根受管区块包含核心规则
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
- **AND** Skills resolution MUST use the workspace source authority and applicable Project capability/applicability context
- **AND** Buildr MUST NOT infer Service-level Skill source support

#### Scenario: Render conflict is validated before writes
- **WHEN** any planned rendered Rules target conflicts with a non-Buildr-managed runtime file
- **THEN** Buildr MUST fail before writing any planned Rules target
- **AND** Buildr MUST report every detected conflict in the selected scope

#### Scenario: Orphan managed bridge cleanup
- **WHEN** a selected scope contains a Buildr-managed rule bridge whose same-directory `AGENTS.md` no longer exists
- **THEN** rendered adapter reconcile MUST remove the orphan bridge
- **AND** Buildr MUST NOT remove non-Buildr-managed runtime files
