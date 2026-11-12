## Context

模型接入当前由 `buildr-agent` 的 `model-access` 统一管理：内置 `ModelProvider` 在服务启动时声明，账号行保存在应用私有 `accounts.json`，每个账号按 `ModelProviderRuntime` 执行 `inspect`、`configure`、`infer`；执行器只拿到本机模型网关地址与短时令牌，网关负责协议转换。现有 API Key 供应商（如 ChatGPT API）在适配器内写死官方端点，账号只保存密钥，用户界面不允许填写 Base URL。

相关行为约束见 `specs/custom-model-providers/spec.md`、修订后的 `specs/model-provider-api-access/spec.md` 与 `specs/model-usage-controls/spec.md`；动机见 `proposal.md`。本次设计需要在不破坏既有账号、模型目录、租约和网关语义的前提下，把「端点」从编译期声明变为按账号运行期配置。

## Goals / Non-Goals

**Goals:**

- 用单个内置 `custom` 提供方适配器支持 OpenAI 兼容 Chat Completions、OpenAI Responses、Anthropic Messages 与 Gemini 四类端点，不为每个端点新增代码或服务声明。
- 自定义配置按账号持久化，与内置供应商共享账号修订、模型目录、模型启停、租约、网关和执行器选择流程。
- 可选 API Key 继续使用账号私有文件，执行器与公共读取都看不到密钥和自定义 Base URL。
- 模型供应商相关界面统一使用「供应商」实体词汇，不改变既有状态语义和后端字段名。

**Non-Goals:**

- 只支持上述四类标准协议；不支持 OAuth、厂商专有签名、Vertex AI 的 OAuth 服务账号或本地 SDK 协议。未知协议值明确拒绝，不静默降级为 OpenAI 兼容。
- 不提供自定义请求头、代理、客户端证书、模型能力自动探测或每模型能力编辑。
- Gemini 协议不映射推理档位到 `thinkingConfig`，也不保留跨轮推理签名；非内联图片地址不能直接作为 Gemini 输入，需以 data URL 提供。
- Google 模型发现使用 API Key 的 `models` 接口，不覆盖 Gemini 企业版或 Vertex AI 的 OAuth 资源发现。
- 不实现自定义供应商的删除、导入导出或跨机器同步；生命周期与内置供应商一致，只提供启停。
- 不改变内置官方供应商的固定端点、密钥校验或模型能力规则。

## Decisions

### 1. 单个 `custom` 提供方 + 账号级配置，而非动态注册提供方

在 `agent-service` 的提供方装配中新增 `createCustomModelProvider()`，所有自定义供应商账号共享该适配器。账号行新增可选 `custom` 配置（显示名之外的 Base URL、协议、是否使用密钥、手工模型列表），由 `ModelProvider.open` 的输入带入运行时；运行时按账号创建并在配置变化时失效重建。

备选方案是为每个自定义账号生成独立 `ModelProvider`，但提供方列表、目录分组、进程生命周期和配置持久化都会变成动态对象，复杂度远高于收益。

### 2. 配置、发现和模型列表分离

- 配置保存端点持久化供应商元数据与模型列表，并按观察版本校验；端点或密钥身份变化时释放该账号已有租约并重建运行时。
- 「获取模型列表」使用独立的只读发现请求，接受未保存的表单值（Base URL、协议、是否使用密钥、可选 API Key）；已有账号未重新输入密钥时可复用已保存密钥。发现按协议使用对应接口：Chat Completions 与 Responses 使用 OpenAI 兼容 `GET <Base URL>/models`；Anthropic Messages 使用带 `anthropic-version` 与密钥头的 `GET <Base URL>/models`；Gemini 使用 `GET <Base URL>/models` 并只保留支持 `generateContent` 的模型，分页有界。发现结果只作为候选返回，不自动写入账号目录。
- 手工添加与发现候选都由用户确认后进入账号模型列表；生成 `ModelOffering` 时保留既有模型启用偏好与上下文覆盖，移除的模型退出目录。

备选方案是保存后才能发现，或发现后自动合并。前者与「先获取列表再保存」的表单流程冲突，后者会覆盖用户手工维护的列表，均不采用。

### 3. 保存时做有界端点核对，状态不冒充已观察

保存配置时先校验 URL 形状（绝对 HTTP(S)、无用户信息、长度有界），再以短超时核对端点：模型列表可用时按真实响应更新状态与观察时间；端点可达但不提供模型列表时，允许保存手工模型并明确诊断；网络或认证失败时不宣称可用，不把旧租约静默切换到新配置。密钥校验失败时不写入新密钥，保留可修正的元数据与其他供应商状态。

### 4. 按声明的协议选择端点、认证与网关转换路径

自定义运行时不再固定为 Chat Completions；账号配置中的协议决定上游调用与网关转换目标。Base URL 不自动补 `/v1`，由用户填写完整前缀：

| 协议 | 推理端点 | 认证头 | 发现接口 |
|---|---|---|---|
| `chat-completions` | `<Base URL>/chat/completions` | `Authorization: Bearer <key>` | `<Base URL>/models` |
| `responses` | `<Base URL>/responses` | `Authorization: Bearer <key>` | `<Base URL>/models` |
| `anthropic-messages` | `<Base URL>/messages` | `x-api-key: <key>`、`anthropic-version: 2023-06-01`，并同时发送 Bearer 以兼容常见代理 | `<Base URL>/models`，同上认证，分页有界 |
| `gemini` | `<Base URL>/models/<model>:generateContent` 或 `:streamGenerateContent?alt=sse` | `x-goog-api-key: <key>` | `<Base URL>/models`，只保留支持 `generateContent` 的模型，分页有界 |

无密钥时不发送任何认证头。Gemini 的模型 id 放在 URL 路径中，请求体不携带 `model` 与 `stream`。

网关继续暴露既有三个执行器入口（`/v1/chat/completions`、`/v1/responses`、`/v1/messages`），把执行器请求转换为账号声明的上游协议。`protocols.ts` 新增 Gemini 作为第四个上游协议：请求序列化为 `contents` / `parts` / `functionDeclarations` / `generationConfig`，流式与非流式响应解码为统一事件，再把文本、推理分片、工具调用、用量与结束原因转换回执行器协议。工具参数守卫对 Gemini 的完整 `functionCall.args` 做有界检查。无法转换的内容（如 Gemini 不能直接读取的远程图片地址、未知内容类型）以明确错误拒绝，不静默丢弃关键输入。

各模型能力采用保守默认：文本与工具可用、图片能力默认不声明、无推理档位；手工配置上下文窗口时按该值表达，未配置时不伪造窗口。工具能力按所选协议声明，上游拒绝时以有界错误返回，不影响其他模型。Gemini 的 `thought` 分片作为推理文本转发，但不承诺跨轮推理签名保留。

### 5. 端点安全与密钥私有复用既有边界

- 自定义端点只由本机模型网关和发现接口访问；执行器仍只获得本机网关地址和短时令牌。
- 拒绝非 HTTP(S)、带用户名或密码的 URL；携带密钥的请求不跟随跨来源跳转；发现响应体有界，错误信息不含密钥。
- 可选密钥写入账号私有目录的现有私有文件机制，未启用密钥时不写文件、不发送 `Authorization`；公共视图只暴露 `credentialConfigured`。
- 发现接口接收表单中的临时密钥，但不持久化、不记录请求体；保存时密钥只进入私有文件。

### 6. 账号身份由端点与凭据共同决定

自定义账号的运行时身份由协议、规范化 Base URL 与密钥摘要（无密钥时使用显式匿名标记）组成。任一项变化都产生新身份，应用层据此释放旧租约并更新账号修订；仅额度、观察时间、诊断或模型返回顺序变化不更新修订。

### 7. 术语只改界面，不改数据与协议字段

用户可见实体统一为「供应商」：列表、筛选、额度概览、操作和错误文案使用自然措辞；登录/连接状态、断开、启停等语义保持不变。后端 DTO 继续使用 `provider`、`account`、`sourceEnabled` 等既有字段，避免为文案变化引入数据迁移或接口破坏。前端集中复用供应商显示名函数，修正当前「任何 API Key 都显示为 ChatGPT API」的映射缺陷，使自定义供应商显示用户填写的名称。

## Risks / Trade-offs

- **用户配置任意 URL 带来本机网络访问面** → 发现与推理只接受显式配置的 HTTP(S) 端点，拒绝 URL 内凭据和跨来源携带凭据的跳转；接口沿用本机回环与既有认证边界，错误与响应体有界。
- **临时密钥经过发现请求** → 发现接口不持久化、不记录请求体，错误统一脱敏；保存仍只写入账号私有文件。
- **工具能力默认可用可能被上游拒绝** → 错误按现有网关边界返回，其他供应商与模型不受影响；后续可在不改协议的情况下增加按模型能力覆盖。
- **Gemini 与其他协议存在语义差异** → 推理签名不跨轮保留、`functionResponse` 依赖上下文中的调用名称、远程图片地址不能直接读取；这些差异以保守转换或明确错误表达，不伪造成功。
- **Anthropic 兼容端点的认证方式不统一** → 同时发送 `x-api-key` 与 Bearer，覆盖官方与常见代理；不接受额外认证头的端点仍可改用 OpenAI 兼容入口。
- **手工模型列表与上游漂移** → 发现只提供候选，手工列表优先；推理错误保留为可操作诊断，不自动删除用户配置。
- **旧版本回退可能丢弃未知的 `custom` 字段** → 账号文件版本保持不变、字段可选；回退风险在交付说明中明确，不通过兼容层掩盖。旧版本仍可读取其他账号，不会被自定义配置阻断。
- **界面文案变化影响浏览器测试选择器** → 更新相关断言，保留稳定 DOM id 与 `data-*` 契约，术语改动不改变交互结构。

## Migration Plan

1. 先发布 `buildr-agent` 与 HTTP 契约：旧账号行缺少 `custom` 字段时按内置供应商行为读取，无需数据迁移。
2. 再更新 `buildr-web`：内置供应商界面只改文案；自定义供应商入口在契约可用后出现。
3. 回退时停用自定义供应商即可停止新租约；账号文件中的自定义配置保持原样，内置供应商与既有会话不受影响。
