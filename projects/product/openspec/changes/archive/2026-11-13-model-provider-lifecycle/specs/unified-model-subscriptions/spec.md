## ADDED Requirements

### Requirement: 独立订阅登录来源必须可删除并与托管登录分离

系统 MUST 允许删除拥有独立本机登录凭据的订阅模型来源，包括 Codex / ChatGPT 订阅、Devin、DeepSeek 与 Qoder CN；删除 MUST 清理该来源的账号元数据、模型列表、启用偏好和本机登录凭据。由智能体连接托管登录的 ChatGPT、Qoder、DSH 来源仍由“智能体”页维护，模型页 MUST NOT 删除其账号或登录。删除 Qoder CN 等与智能体连接共享的登录来源时，MUST 清理唯一登录来源并使对应连接显示未登录，MUST NOT 保留一份可继续使用的旧凭据。界面 MUST 在删除前说明影响并要求确认。

#### Scenario: 删除独立订阅来源

- **WHEN** 用户确认删除独立登录的 Codex / ChatGPT 订阅、Devin 或 DeepSeek 来源
- **THEN** 系统 MUST 移除该来源的账号与模型目录并清理本机登录凭据
- **AND** 其他订阅来源与 API Key 来源 MUST 保持可用

#### Scenario: 不删除智能体托管登录

- **WHEN** 用户尝试从模型页删除由 Codex、Qoder 或 DSH 智能体连接托管的来源
- **THEN** 系统 MUST 拒绝并指引到“智能体”页
- **AND** 对应智能体程序、登录状态和可执行模型 MUST NOT 被修改

#### Scenario: 删除共享的 Qoder CN 登录

- **WHEN** 用户确认删除 Qoder CN 模型来源
- **THEN** 系统 MUST 清理该共享登录并使 Qoder CN 智能体连接显示未登录
- **AND** MUST NOT 继续保留可用的旧凭据或自动重建空账号

### Requirement: 智能体托管登录必须支持退出登录

由 Codex、Qoder 或 DSH 智能体连接托管登录的模型来源 MUST 在模型设置中提供“退出登录”，并与普通供应商的“断开供应商”区分。退出登录 MUST 要求确认，MUST 断开对应智能体连接、关闭其运行时并撤销该来源的模型租约，使来源回到未登录状态。退出登录 MUST NOT 删除对话、历史消息或服务商账号；仍引用该来源的对话 MUST 保留，并在下一次发送前要求重新登录或选择其他模型。

#### Scenario: 退出托管订阅登录

- **WHEN** 用户对 Codex / ChatGPT、Qoder 或 DSH 托管来源确认“退出登录”
- **THEN** 系统 MUST 断开对应智能体连接并使该模型来源不可用
- **AND** 对话与其他供应商 MUST 保持不变

#### Scenario: 退出后重新登录

- **WHEN** 用户退出托管登录后希望继续使用该订阅
- **THEN** 系统 MUST 允许用户从该来源或“智能体”页重新发起登录
- **AND** MUST NOT 自动复用退出前的运行时或租约
