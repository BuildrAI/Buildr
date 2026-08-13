## ADDED Requirements

### Requirement: Onboarding 必须提供 Buildr Web 与 Agent-only 两种一致入口
Buildr MUST 允许用户通过 Buildr Web 或直接在 Agent 对话中开始使用，并 MUST 让两种入口使用相同的 Workspace → Project → Service 心智、同一 source authority 和同一 Agent 执行边界。

#### Scenario: 用户选择 local app
- **WHEN** 用户通过 Buildr Web 添加或进入 Workspace
- **THEN** Buildr Web MUST 帮助用户理解和选择 Workspace、Project 与可选 Service
- **AND** 创建、迁移、修复和开始工作 MUST 通过可复制 Agent Action 交接给 Agent
- **AND** Buildr Web MUST NOT声称自己已经执行 Agent 的专业工作

#### Scenario: 用户只使用 Agent
- **WHEN** 用户不打开 Buildr Web 而在 supported Agent 中请求使用 Buildr
- **THEN** Agent MUST 完成 runtime discovery、init/doctor、首次教学和必要的 Project/Service 引导
- **AND** MUST NOT 要求用户为了完成 onboarding 打开 Buildr Web

#### Scenario: 用户在两种入口之间切换
- **WHEN** 用户先通过 Agent 创建或修改资产，再打开 Buildr Web，或者从 Buildr Web 复制 prompt 后回到 Agent
- **THEN** 两种入口 MUST 从同一 Workspace 源资产读取事实
- **AND** MUST NOT 维护需要双向同步的第二份 Project/Service/onboarding 状态

## REMOVED Requirements

### Requirement: Onboarding 必须提供 local app 与 Agent-only 两种一致入口
Buildr MUST 允许用户通过 local app 或直接在 Agent 对话中开始使用，并 MUST 让两种入口使用相同的 Workspace → Project → Service 心智、同一 source authority 和同一 Agent 执行边界。

#### Scenario: 用户选择 local app
- **WHEN** 用户通过 Buildr App 添加或进入 Workspace
- **THEN** local app MUST 帮助用户理解和选择 Workspace、Project 与可选 Service
- **AND** 创建、迁移、修复和开始工作 MUST 通过可复制 Agent Action 交接给 Agent
- **AND** local app MUST NOT声称自己已经执行 Agent 的专业工作

#### Scenario: 用户只使用 Agent
- **WHEN** 用户不打开 local app 而在 supported Agent 中请求使用 Buildr
- **THEN** Agent MUST 完成 runtime discovery、init/doctor、首次教学和必要的 Project/Service 引导
- **AND** MUST NOT 要求用户为了完成 onboarding 打开 local app

#### Scenario: 用户在两种入口之间切换
- **WHEN** 用户先通过 Agent 创建或修改资产，再打开 local app，或者从 local app 复制 prompt 后回到 Agent
- **THEN** 两种入口 MUST 从同一 Workspace 源资产读取事实
- **AND** MUST NOT 维护需要双向同步的第二份 Project/Service/onboarding 状态
