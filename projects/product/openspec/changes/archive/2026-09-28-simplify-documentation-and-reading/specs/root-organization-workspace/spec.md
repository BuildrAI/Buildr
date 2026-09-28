## MODIFIED Requirements

### Requirement: 默认 workspace 规则路由工具型资产维护
默认工作空间（Workspace）规则（Rule）MUST 保护源资产权威、所有权和授权边界；Buildr 技能（Skill）MUST 负责工具型资产维护的发现、方法、命令与恢复指引，规则（Rule）MUST NOT 复制这些执行流程。

#### Scenario: Agent 读取默认规则
- **WHEN** 智能体（Agent）读取 `buildr init` 生成的 `AGENTS.md`
- **THEN** 规则（Rule）MUST 说明 Buildr 管理长期源资产和可重建投射
- **AND** MUST 说明运行时（Runtime）、本机状态、凭证和临时提示词不是源资产

#### Scenario: 用户要求维护 manifest-backed 工具型资产
- **WHEN** 用户要求新增、修改或删除可复用技能（Skill）或命令（Command）
- **THEN** Buildr 技能（Skill）MUST 按相应清单和命令维护源资产
- **AND** MUST 按需在源资产维护后执行投射或补齐本机环境，并遵守既有授权

#### Scenario: 用户要求维护规则资产
- **WHEN** 用户要求维护根规则（Rule）或项目（Project）、服务（Service）规则（Rule）
- **THEN** Buildr 技能（Skill）MUST 区分 `rules/manifest.yml` 登记与 `AGENTS.md` 正文维护
- **AND** MUST 保留受管区块（Managed Block）所有权和用户正文，仅由正式维护入口更新受管区块（Managed Block）

#### Scenario: Agent 不确定如何维护资产
- **WHEN** 智能体（Agent）不确定如何维护工具型资产
- **THEN** 智能体（Agent）MUST 按用户意图发现 Buildr 技能（Skill）并按需读取当前命令帮助
- **AND** 技能（Skill）不可用时 MUST 根据 `buildr help skill install` 与命令参考修复相应入口

#### Scenario: runtime 或本机缺少能力
- **WHEN** 当前运行时（Runtime）缺少技能（Skill）或本机缺少命令（Command）
- **THEN** 智能体（Agent）MUST 依据当前诊断定位缺失边界，并在已有授权内执行对应恢复
- **AND** MUST NOT 因局部能力缺失阻止其他不依赖该能力的已授权工作
