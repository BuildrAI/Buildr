## MODIFIED Requirements

### Requirement: 提供方必须声明固定端点与认证方式

内置模型服务商目录 MUST 为每个 API Key 来源声明稳定提供方标识、用户可见名称、认证方式、固定官方端点与协议。对内置供应商，用户界面 MUST 只收集该认证方式要求的凭据，MUST NOT 要求用户填写、覆盖或拼接 Base URL。自定义供应商的端点与协议由用户显式声明，MUST 按 `custom-model-providers` 规范校验、保存和使用。通用账号与模型调用流程 MUST 消费内置提供方声明或用户配置，不得在通用流程中写死某一服务商的地址。

#### Scenario: 添加 ChatGPT API 来源

- **WHEN** 用户添加独立的 ChatGPT API 来源
- **THEN** 界面 MUST 只要求填写 API Key，并明确不需要填写 URL
- **AND** Agent Service MUST 使用内置的 OpenAI 官方 API 端点

#### Scenario: 后续增加其他服务商

- **WHEN** 后续提供方使用不同的认证字段、端点或协议
- **THEN** 内置服务商 MUST 通过独立声明与适配器接入
- **AND** 兼容的第三方端点 MUST 能通过自定义供应商配置接入，不要求新增代码适配器
- **AND** 既有 ChatGPT API、套餐账号和其他来源 MUST NOT 被改写

### Requirement: 模型目录必须来自真实服务商观察

内置 API Key 来源 MUST 通过固定官方模型列表核对凭据并维护当前模型目录。自定义供应商 MUST 按 `custom-model-providers` 规范，通过用户配置端点的模型列表发现或用户手工维护的模型目录核对凭据与可用模型。系统 MUST 将模型能力、可用状态和观察失败分别表达；无法从服务商确认的能力 MUST 采用保守表达，MUST NOT 用静态列表冒充当前权益。观察失败时 MAY 保留上次已确认目录，但 MUST 明确本次读取未完成，且 MUST NOT 把它当作零模型或密钥已失效。

#### Scenario: 首次连接并发现模型

- **WHEN** API Key 校验成功且官方模型列表返回可用模型
- **THEN** 账号 MUST 显示这些真实模型的当前目录与观察时间
- **AND** 新发现模型 MUST 按既有账号规则默认停用

#### Scenario: 暂时读取失败

- **WHEN** 已可用账号的模型列表暂时无法读取
- **THEN** 系统 MUST 保留上次有效目录并说明本次观察未完成
- **AND** 其他账号与既有模型选择 MUST NOT 被阻断

#### Scenario: 手动维护模型

- **WHEN** 自定义供应商不提供模型列表接口，或用户选择手动添加模型
- **THEN** 系统 MUST 保留用户维护的模型及其启用偏好
- **AND** 发现失败 MUST NOT 清空或停用这些模型

### Requirement: API 模型必须通过既有安全网关调用

API 模型 MUST 通过 Buildr 现有本机模型网关提供给执行器。调用 MUST 使用账号私有密钥与提供方声明的端点：内置供应商使用固定官方端点，自定义供应商使用用户配置的端点。网关 MUST 保留既有模型绑定、流式响应、工具调用、取消、超时和有界错误处理。执行器 MUST NOT 获得上游 API Key 或自定义 Base URL，也 MUST NOT 直接访问互联网上的任意模型地址。

#### Scenario: 执行器使用 ChatGPT API 模型

- **WHEN** 用户启用并选择 ChatGPT API 模型后在任一兼容执行器中发送请求
- **THEN** 模型请求 MUST 经由当前账号模型绑定发送到 OpenAI 官方 Responses 接口
- **AND** 流式输出、工具调用和取消 MUST 保持既有网关语义

#### Scenario: 执行器使用自定义供应商模型

- **WHEN** 用户启用并选择自定义供应商模型后在兼容执行器中发送请求
- **THEN** 模型请求 MUST 经由本机模型网关发送到用户配置的 Base URL
- **AND** 执行器 MUST NOT 获得该 Base URL 或上游 API Key

#### Scenario: 跨执行器使用

- **WHEN** Codex、DSH 或 Qoder 执行器选择同一 API Key 账号下的已启用模型
- **THEN** 推理由该 API 账号提供，工具和权限仍由所选执行器负责
- **AND** 更换执行器 MUST NOT 复制或暴露 API Key
