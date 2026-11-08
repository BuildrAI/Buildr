## Purpose

定义模型服务商 API Key 来源的固定端点、私有凭据、模型发现与推理边界，使持有服务商 API Key 的用户无需填写 URL 即可在 Buildr 的账号、模型网关和执行器流程中使用模型。首个服务商为 ChatGPT。

## ADDED Requirements

### Requirement: 提供方必须声明固定端点与认证方式

模型服务商目录 MUST 为每个 API Key 来源声明稳定提供方标识、用户可见名称、认证方式、固定官方端点与协议。用户界面 MUST 只收集该认证方式要求的凭据，MUST NOT 要求用户填写、覆盖或拼接 Base URL。通用账号与模型调用流程 MUST 消费提供方声明，不得在通用流程中写死某一服务商的地址。

#### Scenario: 添加 ChatGPT API 来源

- **WHEN** 用户添加独立的 ChatGPT API 来源
- **THEN** 界面 MUST 只要求填写 API Key，并明确不需要填写 URL
- **AND** Agent Service MUST 使用内置的 OpenAI 官方 API 端点

#### Scenario: 后续增加其他服务商

- **WHEN** 后续提供方使用不同的认证字段、端点或协议
- **THEN** 提供方 MUST 通过独立声明与适配器接入
- **AND** 既有 ChatGPT API、套餐账号和其他来源 MUST NOT 被改写

### Requirement: API Key 必须保持账号私有

API Key MUST 只保存在对应模型账号的应用私有目录，文件和目录权限 MUST 限制为当前用户。普通账号读取、模型目录、事件、诊断、错误和日志 MUST NOT 返回或记录明文密钥。API Key MUST NOT 被写入 Git、源资产、公共配置或诊断正文。更换或断开 API Key 后，旧凭据身份驱动的租约 MUST 立即失效，MUST NOT 静默改用新密钥。

#### Scenario: 保存有效密钥

- **WHEN** 用户提交有效 API Key 并通过服务商核对
- **THEN** 账号 MUST 变为可用并发现模型
- **AND** 后续普通读取 MUST 只显示已配置状态，不返回密钥原文

#### Scenario: 无效密钥

- **WHEN** 用户提交无效、过期或无模型访问权限的 API Key
- **THEN** 系统 MUST 报告可操作的认证失败信息，不把账号标为可用
- **AND** 错误、日志和界面 MUST NOT 包含密钥原文

#### Scenario: 更换或断开密钥

- **WHEN** 用户更换 API Key 或断开 ChatGPT API 来源
- **THEN** 旧身份创建的模型租约 MUST 失效
- **AND** 旧请求 MUST NOT 自动使用新密钥重发

### Requirement: 模型目录必须来自真实服务商观察

API Key 来源 MUST 通过固定官方模型列表核对凭据并维护当前模型目录。系统 MUST 将模型能力、可用状态和观察失败分别表达；无法从服务商确认的能力 MUST 采用保守表达，MUST NOT 用静态列表冒充当前权益。观察失败时 MAY 保留上次已确认目录，但 MUST 明确本次读取未完成，且 MUST NOT 把它当作零模型或密钥已失效。

#### Scenario: 首次连接并发现模型

- **WHEN** API Key 校验成功且官方模型列表返回可用模型
- **THEN** 账号 MUST 显示这些真实模型的当前目录与观察时间
- **AND** 新发现模型 MUST 按既有账号规则默认停用

#### Scenario: 暂时读取失败

- **WHEN** 已可用账号的模型列表暂时无法读取
- **THEN** 系统 MUST 保留上次有效目录并说明本次观察未完成
- **AND** 其他账号与既有模型选择 MUST NOT 被阻断

### Requirement: API 模型必须通过既有安全网关调用

ChatGPT API 模型 MUST 通过 Buildr 现有本机模型网关提供给执行器。调用 MUST 使用账号私有密钥与固定官方端点，并保留既有模型绑定、流式响应、工具调用、取消、超时和有界错误处理。执行器 MUST NOT 获得上游 API Key，也 MUST NOT 直接访问互联网上的任意自定义模型地址。

#### Scenario: 执行器使用 ChatGPT API 模型

- **WHEN** 用户启用并选择 ChatGPT API 模型后在任一兼容执行器中发送请求
- **THEN** 模型请求 MUST 经由当前账号模型绑定发送到 OpenAI 官方 Responses 接口
- **AND** 流式输出、工具调用和取消 MUST 保持既有网关语义

#### Scenario: 跨执行器使用

- **WHEN** Codex、DSH 或 Qoder 执行器选择同一 ChatGPT API 账号下的已启用模型
- **THEN** 推理由该 API 账号提供，工具和权限仍由所选执行器负责
- **AND** 更换执行器 MUST NOT 复制或暴露 API Key

### Requirement: ChatGPT 订阅与 API Key 来源必须可同时使用

ChatGPT 订阅账号和 ChatGPT API Key 来源 MUST 作为两个独立、可区分的模型来源共存。两者 MUST 能同时启用、分别发现模型并同时参与模型选择，系统 MUST NOT 要求用户停用其中一个来源才能使用另一个。启用或配置一个来源 MUST NOT 覆盖、迁移或删除另一来源的凭据、模型偏好和既有会话绑定。任一来源失败 MUST NOT 使另一来源或无关模型来源失效。

#### Scenario: 同时启用订阅与 API Key

- **WHEN** 用户已在 Codex 订阅账号中登录，并另行配置 ChatGPT API Key
- **THEN** 订阅来源和 API Key 来源 MUST 同时保持可用
- **AND** 两者 MUST 分别作为独立分类出现在模型选择器，并可被用户随时选择

#### Scenario: API Key 来源失败不影响订阅账号

- **WHEN** ChatGPT API Key 无效或模型读取失败
- **THEN** Codex 订阅账号及其他已登录来源 MUST 保持原状态与模型
- **AND** 对话界面 MUST 只提示影响当前选择的具体异常
