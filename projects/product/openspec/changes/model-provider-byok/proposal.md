## Why

当前模型接入只支持内置声明、固定端点的服务商（Codex 订阅、ChatGPT API、DeepSeek、Qoder 等），持有 OpenAI 兼容网关（自建代理、OpenRouter、vLLM、组织内部网关等）的用户无法把已有模型接入 Buildr，只能改代码新增提供方。同时，模型设置相关页面混用「来源」「账号」等词指代同一个对象，用户难以判断页面在管理什么。

本次变更统一模型供应商相关界面的实体词汇为「供应商」，并新增 BYOK（Bring Your Own Key）自定义供应商：用户自行填写 Base URL、协议、可选 API Key 与模型列表，模型经现有本机模型网关供执行器使用。这样无需为每个兼容端点发布新代码，同时保持凭据私有和执行器边界。

## What Changes

- 模型供应商相关界面统一使用「供应商」作为实体名称：列表、分组、添加、停用、额度概览与操作文案都用自然措辞表达，不再用「来源」或「账号」指代供应商；连接状态（已登录、已连接、未配置等）保持原语义。
- 新增「自定义供应商（BYOK）」管理：可添加、编辑、启停、删除自定义供应商；配置包含显示名称、Base URL、协议（OpenAI 兼容 Chat Completions、OpenAI Responses、Anthropic Messages、Gemini）、是否使用 API Key 及可选密钥。
- 自定义供应商按所选协议使用对应的上游端点、认证头与模型发现方式；本机网关负责把执行器请求转换为所选协议，再把文本、图片、工具调用、推理、流式输出、用量与取消转换回执行器协议，不可转换的内容明确拒绝。
- 自定义供应商的模型列表支持「获取模型列表」和「手动添加模型」两种方式；手动模型可维护 id、显示名与上下文窗口，自动发现不得覆盖用户手工维护的列表。
- 自定义供应商与内置供应商使用同一账号、模型目录、修订、模型启停、本机模型网关、额度未知与执行器选择流程；模型经网关转发到用户配置的端点，执行器不直接获得 Base URL 或 API Key。
- 修订 `model-provider-api-access` 中「界面 MUST NOT 要求填写 Base URL」的约束：固定端点要求收窄到内置官方供应商；自定义端点作为独立能力受新规范约束。
- **BREAKING**：无。既有内置供应商、账号数据、模型偏好和会话绑定保持兼容；新增配置字段为可选，旧数据无需迁移。

## Capabilities

### New Capabilities

- `custom-model-providers`: 定义 BYOK 自定义供应商的配置、凭据私有、模型列表（发现与手动维护）、端点校验、本机网关转发和执行器边界。

### Modified Capabilities

- `model-provider-api-access`: 将固定端点与「不得填写 Base URL」的要求限定为内置官方供应商；调整「后续增加服务商」场景，使自定义供应商可由用户声明而非必须新增代码适配器；保留 API Key 私有与网关约束。
- `model-usage-controls`: 供应商列表、额度概览与停用入口使用「供应商」实体词汇；`全部来源` 等固定标签改为供应商语义；补充自定义供应商在供应商列表与额度未知表达中的行为。

## Impact

- **buildr-agent**：`model-access/contracts.ts`、`application.ts`、新增自定义供应商运行时与端点校验、按协议的模型发现接口、`protocols.ts` 的 Gemini 协议转换与工具流守卫、操作 schema 与 HTTP 路由/DTO；单元与集成测试。
- **buildr**：Agent Service HTTP 契约、handler 与进程操作白名单；随包资源与 Web 托管产物按构建流程更新。
- **buildr-web**：`AccountModelManager`、`AgentConnectionSettings`、`CustomProviderForm`、`custom-provider-model.ts`、`account-model-view.ts`、`account-quota-view.ts`、`ModelPicker`、`model-picker.ts`、`conversation-model-label.ts`、`AccountQuotaButton`、`ConversationDockSurface` 及相关浏览器/单元测试。
- **持久化**：账号记录新增可选自定义配置字段（Base URL、协议、密钥使用开关、手动模型列表），继续保存在应用私有账号目录；API Key 仍只存账号私有文件，不进入公共读取、日志或 Git。
- **安全边界**：自定义端点仅由本机模型网关访问；校验只接受合法 HTTP(S) 地址并拒绝携带凭据的 URL；执行器仍只获得本机网关地址与短时令牌。
