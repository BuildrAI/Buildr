## ADDED Requirements

### Requirement: Antigravity 智能标题必须经隔离无工具会话生成简体中文摘要

Antigravity 执行方 MUST 提供独立于工作上下文的辅助智能标题生成能力。标题生成 MUST 在独立私有空临时目录中启动不带 `--dangerously-skip-permissions`、不挂载 MCP 的隔离 `agy acp` 会话，MUST 核验当前登录的 Google 个人账号身份与对话绑定身份一致，MUST NOT 读取或修改工作会话历史。当对话选用重型规划模型（如 `orchestrator`）时，辅助标题会话 MUST 优先选择同一账号下可用的轻量快速非规划模型与最低思考深度。标题提示词 MUST 要求输出简体中文精短标题（目标 12–18 字、最多 24 字；必要专名可保留英文原文但标题主体必须包含中文）。若辅助会话尝试调用工具、发起权限或表单请求，系统 MUST 拒绝并中止本次请求（`agent_title_tools_forbidden`）；若返回缺少中文字符或格式非法，系统 MUST 判定为无效输出（`agent_title_output_invalid`）而不覆盖原标题；结束后 MUST 关闭辅助进程并清理临时会话文件。

`agy` 工作会话内通过 `session_info_update` 推送的纯英文原生标题 MUST NOT 替换 Buildr 的中文兜底标题或打断正在进行中的独立智能标题生成。

#### Scenario: Antigravity 为 Google 个人账号对话生成简体中文标题

- **WHEN** 用户使用 Antigravity（含 `gemini-pro-orchestrator` 等模型）开展对话
- **THEN** 系统 MUST 通过独立隔离的无工具 `agy acp` 会话自动挑选轻量模型并生成包含简体中文的精短标题
- **AND** 工作会话历史与工作目录文件 MUST 保持未修改，辅助进程与临时文件结束后 MUST 被清理

#### Scenario: 拒绝辅助会话的工具调用或纯英文返回

- **WHEN** Antigravity 辅助标题会话尝试触发工具调用或权限审批，或返回不含中文字符的英文标题
- **THEN** 系统 MUST 拒绝该工具调用或拒绝采用该输出，保留当前兜底或已有标题并记录对应错误状态

#### Scenario: 阻止原生英文 session_info_update 覆盖中文兜底标题

- **WHEN** Antigravity 工作会话推送纯英文 `session_info_update` 原生标题，或独立智能标题尚在生成中
- **THEN** 系统 MUST NOT 用纯英文原生标题覆盖当前标题，也 MUST NOT 中止正在进行的独立中文标题请求
