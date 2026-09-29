## MODIFIED Requirements

### Requirement: Buildr 作为 Agent 时代的项目契约
Buildr MVP MUST 将 Buildr 使用方式定义为跨 Agent 的项目协作契约。

#### Scenario: Agent 原生支持 Buildr
- **WHEN** 用户使用的 Agent 产品原生支持 Buildr
- **THEN** Agent MUST 能直接按 Buildr workspace 资产和规则工作

#### Scenario: Agent 未原生支持 Buildr
- **WHEN** 用户使用的 Agent 产品未原生支持 Buildr
- **THEN** 用户 MUST 能通过自然语言让智能体（Agent）依据 Buildr 产品说明和当前命令帮助安装、初始化或恢复 Buildr 技能（Skill），并继续使用工作空间（Workspace）资产
