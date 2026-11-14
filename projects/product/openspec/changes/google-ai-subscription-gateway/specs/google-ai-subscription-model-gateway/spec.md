## ADDED Requirements

### Requirement: 内置 Google AI 供应商

Buildr SHALL 使用单一内置供应商展示已授权 Google AI 账号的可用订阅模型。Agent Service SHALL 管理本机代理进程并对模型调用校验登录身份。

#### Scenario: 复用已有登录

- **WHEN** Agent Service 观察到本机代理配置域内有效的 Google AI 登录和模型目录
- **THEN** 模型选择器 SHALL 在 Google AI 下展示可供兼容 Harness 使用的模型
- **AND** 已准确识别的旧代理自定义来源 SHALL 退出列表和选择器，旧会话 SHALL 保留历史并在新调用时提示重新选择

#### Scenario: 发起登录

- **WHEN** 用户从内置 Google AI 卡片开始登录
- **THEN** 应用 SHALL 提供 Google 授权页，并在授权成功后重新读取模型和额度

### Requirement: Google AI 额度窗口

Buildr SHALL 在 Google AI 卡片中以 Gemini 和 Claude / GPT 分组展示同一次 daily 响应提供的每周、5 小时剩余百分比及重置时间。

#### Scenario: 刷新额度

- **WHEN** Agent Service 收到完整的四个额度窗口
- **THEN** 应用 SHALL 从一次观察更新两个分组
- **AND** 观察失败时 SHALL 保留上一次已观察额度并标记过期
