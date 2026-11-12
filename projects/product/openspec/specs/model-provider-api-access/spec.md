# model-provider-api-access Specification

## Purpose
定义模型服务商 API Key 来源的固定端点、私有凭据、模型发现与推理边界，使持有服务商 API Key 的用户无需填写 URL 即可在 Buildr 的账号、模型网关和执行器流程中使用模型。首个服务商为 ChatGPT。

## Requirements

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

### Requirement: ChatGPT API 模型必须表达官方确认的能力与统一显示名

ChatGPT API 来源 MUST 使用 OpenAI 官方模型页等可核对来源补充已知模型的显示名、输入模态、工具、上下文窗口、最大输出和推理档位；模型 id 与带日期快照 id MUST 归一为基础模型能力，底层调用 id MUST 保持服务商返回的原值。无法从官方来源确认的模型 MUST 继续保守表达，MUST NOT 从静态目录推断账号当前权益或可用性。

#### Scenario: 读取 gpt-6.1-sol

- **WHEN** OpenAI 模型目录返回 `gpt-6.1-sol`
- **THEN** 系统 MUST 显示 `GPT-6.1-Sol`，并表达图片输入、工具调用、1,050,000 上下文和 `low`、`medium`（默认）、`high`、`xhigh`、`max` 推理档位
- **AND** 系统 MUST NOT 声称该模型支持官方页面明确列为不支持的视频输入；视频画面仍按图片帧处理

#### Scenario: 读取带日期快照

- **WHEN** 模型目录返回 `gpt-5.4-mini-2026-03-17`
- **THEN** 显示名与能力 MUST 按基础模型 `gpt-5.4-mini` 表达
- **AND** 推理请求中的模型 id MUST 仍使用服务商返回的 `gpt-5.4-mini-2026-03-17`

#### Scenario: 未知文本模型

- **WHEN** 模型目录返回没有官方能力记录的文本模型
- **THEN** 系统 MUST 保留真实 id、文本与工具保守能力，MUST NOT 伪造图片、上下文窗口或推理档位

### Requirement: ChatGPT API 目录必须只提供 Responses 文本对话模型

ChatGPT API 来源 MUST 排除嵌入、语音、转写、实时、图片生成、视频、审核以及仅用于搜索或实时语音的模型。过滤 MUST 基于服务商返回的真实 id 与官方用途，MUST NOT 为了保持数量而把不受 Responses 支持的模型作为可执行候选。

#### Scenario: 排除实时与搜索模型

- **WHEN** 模型目录返回 `gpt-live-1` 或 `gpt-5-search-api`
- **THEN** 系统 MUST NOT 把它们加入文本对话模型候选

#### Scenario: 保留 Responses 文本模型

- **WHEN** 模型目录返回官方页面声明支持 Responses 的 GPT、o 系列或 codex 文本模型
- **THEN** 系统 MUST 保留该模型作为候选，同时继续过滤明确的非对话模型
