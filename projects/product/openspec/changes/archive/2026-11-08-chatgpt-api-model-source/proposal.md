## Why

Buildr 目前只能通过 Codex 订阅账号使用 ChatGPT 模型。持有 OpenAI API Key 的用户无法在 Buildr Agent Service 中直接以 API 方式使用同一厂商的模型，也没有位置让订阅账号与 API Key 账号同时提供模型。

现在需要先支持 ChatGPT API，同时保留一个不依赖自定义 URL 的提供方接入骨架，使后续不同服务商可以各自声明认证方式、固定官方端点和协议适配，而通用账号、模型目录、模型网关和执行器流程不重复改造。

## What Changes

- 新增 ChatGPT API Key 模型来源，固定使用 OpenAI 官方 API；用户只填写 API Key，不填写 URL。
- API Key 由模型来源独立保存到账号私有目录，不进入公共账号视图、事件、诊断或 Git。
- 通过固定官方模型列表核对密钥、发现模型并维护真实目录；支持模型启停、刷新、更换密钥和断开。
- ChatGPT API 模型复用现有模型网关、Responses 协议转换、流式响应、工具调用、取消和租约失效边界。
- 账号设置中新增独立的“ChatGPT API”来源卡片，并在同一卡片完成密钥录入、校验、模型管理和断开。
- 模型选择器将订阅来源与 API Key 来源作为两个独立分类展示，两者可同时启用、同时参与模型选择，不要求停用另一来源。
- 提供方声明认证方式、固定端点和协议；本次只为 ChatGPT 增加 API 适配器，不提供自定义 Base URL 或任意兼容端点。
- 既有 Codex 订阅账号、历史会话、其他模型来源和用户默认桌面配置保持不变。

不包含破坏性变更。现有账号、模型目录和会话绑定继续兼容。

## Capabilities

### New Capabilities

- `model-provider-api-access`: 定义模型服务商 API Key 来源的提供方声明、固定端点、私有凭据、目录发现、模型调用，以及 ChatGPT API 模式的可观察行为。

### Modified Capabilities

- `unified-model-subscriptions`: 明确 API Key 来源与既有套餐账号作为独立分类并列参与模型目录、账号修订、租约和跨执行方使用，同时保持凭据隔离。
- `model-usage-controls`: 明确独立 ChatGPT API 来源卡片的录入、校验、状态、模型管理与断开行为，以及其与订阅来源可同时使用。

## Impact

- `projects/product/services/buildr-agent/`：模型来源契约、账号应用、OpenAI API 适配器、操作契约和测试。
- `projects/product/services/buildr/`：Agent Service HTTP 操作与响应契约。
- `projects/product/services/buildr-web/`：账号设置中的 ChatGPT API 来源、模型选择器独立分类和相关 API 客户端。
- 不新增外部运行时依赖；继续使用 Node.js `fetch` 与现有模型网关。
- 需要更新模型来源及账号设置相关的当前知识说明与验证入口。
