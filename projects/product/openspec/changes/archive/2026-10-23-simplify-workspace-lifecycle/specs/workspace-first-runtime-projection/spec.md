## ADDED Requirements

### Requirement: 官方源共享且空间成品独立
官方技能源 SHALL 从空间明确采用的共享资源集读取；组织自有源 SHALL 继续从空间读取。运行时生成 MUST 使用当前空间启停、绑定、组件片段及完整附件，MUST 保留现有适配器和所有权保护；共享源 MUST NOT 被当作用户级成品安装。

#### Scenario: 不同空间采用不同提供者
- **WHEN** 相同官方技能在两个空间有不同的有效绑定
- **THEN** MUST 分别生成正确的绑定内容，且不改写共享原文

## MODIFIED Requirements

### Requirement: Skills runtime 区分产品内置 Skill 与 workspace Skill
Buildr runtime projection MUST 区分产品内置 Agent Skills 与 workspace Skill source，并 MUST 将写入 user/workspace destination 的内容视为可重建 runtime 投射产物；Project MUST NOT 构成 Skill source、安装或可见性隔离层。

#### Scenario: 安装产品内置 Skill
- **WHEN** 当前 Agent runtime 支持 Skills 且 Buildr package manifest 声明了适用的产品内置 Agent Skill
- **THEN** `buildr skill install <agent>` MUST 将该 Skill 安装或修复到目标 Agent runtime
- **AND** `buildr skills render <agent>` MUST NOT 安装或修复该产品内置 Skill

#### Scenario: 保持 workspace Skill 解析
- **WHEN** workspace 根定义了 `skills/manifest.yml`
- **THEN** `buildr skills render <agent>` MUST 从工作空间采用清单解析 enabled Skills，官方引用从已采用共享资源集读取，组织自有内容从本地源读取
- **AND** Project `capabilities.yml` MUST 只提供 requirements、bindings 与 applicability context
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
