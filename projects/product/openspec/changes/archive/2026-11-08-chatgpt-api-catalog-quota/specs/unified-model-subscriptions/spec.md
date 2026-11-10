## MODIFIED Requirements

### Requirement: API Key 来源必须与套餐账号并列参与统一模型流程

系统 MUST 将 API Key 模型来源视为与套餐账号并列的独立账号参与模型目录、账号修订、模型偏好、本机模型网关和执行器选择。订阅账号与 API Key 账号 MUST 能同时保持可用，并 MUST 在模型选择器中作为两个独立分类出现，例如 `ChatGPT` 分类与 `ChatGPT API` 分类；系统 MUST NOT 用互斥模式开关或单一来源合并两者。模型来源名称 MUST 与执行智能体名称分开表达：执行智能体 `Codex` MUST 继续显示为 `Codex`，执行智能体 `DSH` MUST 继续显示为 `DSH`，而 DSH 接入的 DeepSeek 模型来源 MUST 显示为 `DeepSeek`。账号身份 MUST 由实际凭据身份确定但不得公开凭据；模型租约 MUST 绑定账号身份及模型配置。API Key 来源 MUST 遵守既有账号隔离、目录观察、额度未知、模型启停、跨执行器消费和错误保真要求。

#### Scenario: API Key 来源出现在统一模型目录

- **WHEN** ChatGPT API Key 校验成功并发现已启用模型
- **THEN** 该模型 MUST 出现在统一模型目录并可供兼容执行器选择
- **AND** 账号来源 MUST 可追溯并在模型选择器中显示为独立的 `ChatGPT API` 分类

#### Scenario: 订阅和 API Key 同时参与模型选择

- **WHEN** Codex 订阅账号与 ChatGPT API Key 均已连接并启用模型
- **THEN** 模型选择器 MUST 同时显示 `ChatGPT` 和 `ChatGPT API` 分类
- **AND** 用户 MUST 能分别选择任一来源的模型，不要求停用另一来源或切换全局模式

#### Scenario: 执行智能体与模型来源分离

- **WHEN** Codex 执行智能体选择订阅来源或 ChatGPT API 来源的模型
- **THEN** 执行身份 MUST 显示为 `Codex`
- **AND** 模型来源 MUST 分别显示为 `ChatGPT` 或 `ChatGPT API`，不得把执行智能体名称当作模型来源名称

#### Scenario: DSH 与 DeepSeek 来源分离

- **WHEN** DSH 执行智能体使用其接入的 DeepSeek 账号模型
- **THEN** 执行身份 MUST 显示为 `DSH`
- **AND** 模型来源 MUST 显示为 `DeepSeek`，不得把 DSH 显示为模型来源

#### Scenario: 密钥身份变化

- **WHEN** 用户为同一 API Key 账号更换密钥
- **THEN** 账号身份 MUST 更新并使旧模型租约失效
- **AND** 新请求 MUST 显式使用新密钥配置，不静默重放旧请求

#### Scenario: 额度未知

- **WHEN** OpenAI 官方接口未提供可读取的套餐额度
- **THEN** 系统 MUST 明确额度未知，仍可正常展示与使用模型
- **AND** MUST NOT 制造零余额或已耗尽结论

## ADDED Requirements

### Requirement: Qoder 模型目录必须覆盖真实 app 分组模型

Qoder 来源 MUST 合并 `/models` 返回的 `chat` 与 `app` 分组，按模型 key 去重并优先保留 `chat` 分组配置；只出现在 `app` 分组的真实模型（例如 `lmodel / QoDuck`）MUST 进入模型目录。系统 MUST 使用该模型的真实显示名、图片能力、思考档位、上下文与调用配置，MUST NOT 凭空添加服务商未返回的模型。

#### Scenario: 发现 QoDuck

- **WHEN** `chat` 分组没有 `lmodel`，而 `app` 分组返回 `lmodel / QoDuck`
- **THEN** QoDuck MUST 在模型目录中出现一次，并显示真实名称、图片能力、思考档位与上下文
- **AND** 该模型 MUST 使用返回的真实模型配置参与调用

#### Scenario: 两个分组重复同一模型

- **WHEN** `chat` 与 `app` 分组返回相同 key 的模型
- **THEN** 系统 MUST 只保留一个目录项
- **AND** `chat` 分组配置 MUST 优先，模型启停偏好在刷新后 MUST 保持
