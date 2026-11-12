## 1. 模型访问契约与持久化

- [x] 1.1 在 `buildr-agent` 的 model-access 契约中新增自定义供应商账号配置（`custom`: 协议、Base URL、是否使用 API Key、手工模型列表）、配置/发现输入与发现结果类型，并让 `ModelProvider.open` 接收账号级 `custom` 配置；运行 `npm --prefix services/buildr-agent run typecheck` 验证类型检查通过。
- [x] 1.2 扩展 `ModelAccessApplication.add` 与新增自定义供应商配置方法：接受名称、Base URL、协议、可选 API Key 与手工模型，校验绝对 HTTP(S) URL（拒绝用户信息、非 HTTP(S) 与超长字段），持久化到 `accounts.json` 且公共视图不返回密钥；验证方式为新增 `test/unit/model-access.test.ts` 用例并运行 `npm --prefix services/buildr-agent test` 通过。
- [x] 1.3 让自定义账号身份由协议、规范化 Base URL 与密钥摘要（无密钥用匿名标记）组成，配置或密钥变化时旋转 `identity`、重建运行时并释放该账号旧租约；验证方式为单元测试覆盖身份变化释放租约、仅观察结果变化不更新修订。
- [x] 1.4 新增 `custom` 单例提供方适配器：协议固定 `chat-completions`，请求 `<Base URL>/chat/completions`，可选 `Authorization: Bearer`，拒绝跨来源携带密钥的跳转；验证方式为新增 `test/unit/model-providers.test.ts` 用例断言请求 URL、认证头缺失/存在与错误映射，运行 `npm --prefix services/buildr-agent test` 通过。
- [x] 1.5 实现自定义供应商模型发现（`GET <Base URL>/models`）：只把响应作为候选返回，不写账号目录；无密钥配置时不发送 `Authorization`；发现失败返回有界诊断且不影响已保存模型；验证方式为单元测试使用本地假端点覆盖成功、401、非 JSON 与网络失败。
- [x] 1.6 在 `agent-service` 的提供方装配中注册 `createCustomModelProvider()`，使自定义账号参与账号列表、模型目录、偏好、租约与网关流程；验证方式为运行 `npm --prefix services/buildr-agent test` 并通过既有 `model-access`、`model-preferences` 用例。

## 2. 网关与 HTTP 契约

- [x] 2.1 确认自定义运行时经既有本机网关完成 Responses/Anthropic 到 Chat Completions 的请求与流式响应转换，保留工具调用、取消与超时语义，执行器不接触 Base URL 与密钥；验证方式为新增 `test/unit/model-gateway.test.ts` 用例覆盖自定义账号的流式转换、工具调用与取消，运行 `npm --prefix services/buildr-agent test` 通过。
- [x] 2.2 在 `operation-schemas.ts` 新增自定义供应商配置与模型发现操作 schema，并在 `process/operations.ts` 白名单登记；验证方式为运行 `npm --prefix services/buildr-agent test` 通过且 schema 编译无告警。
- [x] 2.3 在 `buildr` 服务的 HTTP 操作表与路由中新增配置/发现入口（`POST /model-accounts/:accountId/custom` 与 `POST /model-custom/discovery` 或等价命名），复用既有输入校验与错误映射；验证方式为新增/更新 `services/buildr/test/integration/model-access.test.ts`，运行 `npm --prefix services/buildr test:integration` 通过。
- [x] 2.4 保证 `modelAccount` DTO 暴露自定义供应商显示名、`custom.baseUrl`、协议、是否使用密钥与模型列表，但不暴露密钥；验证方式为集成测试断言响应字段与 `credentialConfigured`。

## 3. 界面术语统一

- [x] 3.1 将模型设置抽屉中的「账号来源」「全部来源」「全部账号」「账号与额度」「断开账号」「账号共享额度」「显示已停用来源」「重新启用来源」等文案改为「供应商」口径，状态与操作语义保持不变；验证方式为运行 `npm --prefix services/buildr-web test` 并通过相关断言，同时在预览中逐项核对文案。（实际结果：预览中旧术语 0 次匹配，显示「全部供应商」「显示已停用供应商」「断开供应商」等；`npm --prefix services/buildr-web test` 通过。）
- [x] 3.2 统一额度浮层、模型选择器、搜索占位、来源快捷行、模型上下文提示和对话错误文案中的「来源/账号」为「供应商」；验证方式为更新浏览器测试选择器断言并运行 `npm --prefix services/buildr-web test` 通过。（实际结果：预览核对额度浮层、模型选择器与卡片文案均为「供应商」口径；web 单元测试通过。）
- [x] 3.3 修正 `accountSourceName`：只有 `provider === 'openai'` 且 `authType === 'api-key'` 时显示 `ChatGPT API`，自定义供应商显示用户填写的名称，并与列表、额度浮层共用同一显示名函数；验证方式为新增 `account-quota-view`/`account-model-view` 单元测试覆盖自定义供应商与内置 API Key 来源。（实际结果：`account-model-view.test.mjs` 覆盖自定义供应商按用户名称显示与内置 API Key 来源；后者保留 `ChatGPT API`。）
- [x] 3.4 在 web API 客户端与类型中新增自定义供应商配置、模型发现调用，并扩展 `ModelAccount` 的 `custom` 字段；验证方式为 `npm --prefix services/buildr-web run typecheck` 通过。（实际结果：`test:static` 的 frontend-typecheck 通过。）

## 4. 自定义供应商界面

- [x] 4.1 在模型设置中新增「添加供应商」入口与表单：供应商名称、API 协议（OpenAI 兼容，不可选其他）、Base URL、使用 API Key 开关、API Key 密码输入、启用开关，保存后在同一卡片显示状态、模型与观察时间；验证方式为浏览器操作预览完成新增并截图核对。（实际结果：预览新增「演示网关」成功，卡片显示已连接、模型 0/3 与观察时间；截图 `/tmp/model-provider-byok-preview-evidence/01-discover-join-manual.png`。）
- [x] 4.2 实现「获取模型列表」：使用当前表单值（含未保存的 Base URL 与可选密钥）请求发现接口，结果作为候选展示，用户确认后加入模型列表；验证方式为使用本地兼容端点或假服务在预览中完成发现与加入。（实际结果：本地假端点返回 2 个模型，预览提示「从端点发现 2 个模型」并成功加入；截图同上。）
- [x] 4.3 实现「手动添加模型」：填写模型 id、显示名与可选上下文窗口，加入账号模型列表并保留既有启用偏好；验证方式为单元测试覆盖列表合并与偏好保留，并在预览中操作验证。（实际结果：预览手动添加「手动模型」并设置上下文 64K，启用偏好与设置刷新后保留；模型列表视图与偏好合并由 web 单元测试覆盖。）
- [x] 4.4 支持自定义供应商卡片编辑 Base URL/密钥、启停来源、模型启停与上下文设置、刷新与断开；断开或更换不影响内置供应商与其他自定义供应商；验证方式为预览中操作两张自定义卡片并核对隔离。（实际结果：编辑表单回填已保存配置；停用/重新启用/移除按预期生效；断开「备份网关」后显示待配置，另一自定义供应商与内置卡片不受影响；截图 `03-two-custom-cards.png`。）
- [x] 4.5 自定义供应商额度未知时明确显示未知说明，不显示为零余额或耗尽，模型仍可用；验证方式为预览核对额度页与账号卡片文案。（实际结果：显示「自定义供应商没有额度接口，Buildr 不推断余额。」与「额度暂不可读」，模型保持可用；截图 `04-quota-unknown.png`。）

## 5. 当前认知

- [x] 5.1 执行当前认知维护 `assess`，把本变更对 `knowledge/docs/architecture/agent-integration.md` 的影响写入 `.buildr/knowledge-impact.yml`（任务与变更标识 `model-provider-byok`，状态按实际维护结果），验证方式为检查该文件内容与本任务一致。
- [x] 5.2 更新 `knowledge/docs/architecture/agent-integration.md`：说明内置官方供应商固定端点与自定义供应商用户声明的区别、自定义配置/发现/网关边界、可选密钥与身份规则，并将相关界面术语统一为「供应商」；验证方式为回读文档确认与实现和规范一致，然后把影响状态更新为 `updated`。

## 6. 收敛验证

- [x] 6.1 运行四服务静态检查：`npm --prefix services/buildr-agent run test:static`、`npm --prefix services/buildr run test:static`、`npm --prefix services/buildr-web run test:static`、`npm --prefix services/dsh-plugin run test:static`，全部通过。（实际结果：buildr-agent、buildr、buildr-web 通过；dsh-plugin 源码结构检查通过，plugin-typecheck 与 plugin-test-typecheck 因本机未准备 DSH SDK 环境返回 unavailable，非代码失败。）
- [x] 6.2 运行四服务单元测试：`npm --prefix services/buildr-agent test`、`npm --prefix services/buildr test`、`npm --prefix services/buildr-web test`、`npm --prefix services/dsh-plugin test`，全部通过。
- [ ] 6.3 运行受影响集成测试：`npm --prefix services/buildr test:integration` 与 `npm --prefix services/buildr-agent run test:integration`，全部通过。（实际结果：受影响定向复跑通过——integration-workspace-assets、integration-connections-cli、npm-launcher；buildr-agent 原生集成组直接运行 217 通过 / 0 失败。全套 `test:integration` 仍存在与本变更无关的既有失败 `conversation-unknown-settlement.test.ts:42`（期望 attention 1、实际 0），已用 HEAD `e9bba2779` 的原始文件复现，且在开发分支同样存在，未修复。此外 dsh-plugin 的 DSH SDK 环境缺口见 6.1。故本项不声明「全部通过」。变基到 `origin/dev` 后，`services/buildr` 的 `test/integration/model-access.test.ts` 1/1 通过，`services/buildr-agent` 的 `test/integration/model-access.test.ts` 与 `model-providers.test.ts` 45/45 通过；agent 原生集成组的 `agent-integration-native` 因运行器 60 秒上限超时（同组 claude 用例已耗时约 36 秒），改用直接 `node --test` 运行相关文件取得上述结果。）
- [x] 6.4 按 `buildr-dev-preview` 启动本工作树 Buildr Web，在「智能体与模型」中完成术语核对、自定义供应商新增、模型发现/手动添加、启停与断开、额度未知展示，并确认内置 ChatGPT/ChatGPT API 卡片不受影响；保留截图或操作记录作为验证证据。（实际结果：托管预览实例 model-provider-byok 完成端到端核对，内置 ChatGPT / ChatGPT API / DeepSeek / Qoder / Qoder CN 卡片行为不变；截图保存在 `/tmp/model-provider-byok-preview-evidence/`（01-discover-join-manual、02-model-picker、03-two-custom-cards、04-quota-unknown）。密钥隔离核对：`accounts.json` 中无密钥，API Key 仅存于账号私有 `model-api-key.json`（权限 0600）。预览已停止；收尾时用工作树源码 CLI 按任务归属执行 `web preview stop --task ... --purge`，校验通过并删除整个实例根（宿主缓存符号链接按条目 unlink、不跟随），`web preview prune` 无孤儿残留。）

## 7. 多协议扩展（Responses / Anthropic Messages / Gemini）

- [x] 7.1 扩展自定义供应商协议契约：`CustomProviderConfig.protocol` 与 `normalizeCustomProtocol` 接受 `chat-completions`、`responses`、`anthropic-messages`、`gemini`，其他值明确拒绝；账号身份继续包含协议；验证方式为 `npm --prefix services/buildr-agent run typecheck` 与新增单元测试覆盖四种协议与未知值。（实际结果：typecheck 通过；`model-providers.test.ts` 覆盖四种协议接受、未知值拒绝与身份包含协议。）
- [x] 7.2 让自定义运行时按协议构建上游请求：Chat Completions 与 Responses 使用对应路径和 Bearer；Anthropic Messages 使用 `/messages`、`anthropic-version` 与密钥头；Gemini 使用 `models/<id>:generateContent` / `:streamGenerateContent?alt=sse` 与 `x-goog-api-key`，并从请求体移除 `model` 与 `stream`；验证方式为单元测试断言每种协议的 URL、认证头、请求体与错误映射。（实际结果：`model-providers.test.ts` 覆盖四种协议的 URL、认证头、请求体与 `models/` 前缀处理；typecheck 通过。）
- [x] 7.3 实现按协议的模型发现：Chat Completions/Responses 使用 OpenAI 兼容列表；Anthropic Messages 使用带 `anthropic-version` 与密钥头的列表并做有界分页；Gemini 使用 Google 模型列表、只保留 `generateContent` 模型、去掉 `models/` 前缀并做有界分页；验证方式为单元测试使用本地假端点覆盖成功、认证失败、无列表接口与分页。（实际结果：`model-providers.test.ts` 覆盖 Anthropic `limit`/`after_id` 分页与第二页失败保留候选、Gemini `pageSize`/`pageToken`、能力过滤与前缀处理、认证失败与无列表接口；有界读取上限为 10 页/1000 模型。）
- [x] 7.4 在 `protocols.ts` 增加 Gemini 作为第四个上游协议：请求序列化为 `contents`/`parts`/`systemInstruction`/`functionDeclarations`/`generationConfig`，非流式与 SSE 响应解码为统一事件，转换文本、推理分片、工具调用（含工具结果名称解析）、用量与结束原因；`tool-stream-guard.ts` 对 Gemini `functionCall.args` 做有界检查；验证方式为单元测试覆盖 Gemini 请求序列化、流式/非流式解码、工具调用与不可转换内容。（实际结果：新增 `test/unit/model-protocols.test.ts` 6 个用例全部通过，覆盖请求序列化与 schema 大写递归、远程图片与未解析工具结果拒绝、非流式/流式解码、结束原因映射、无完成标记与不可转换内容错误、工具参数空白停摆保护；typecheck 通过。）
- [x] 7.5 更新 HTTP 操作 schema 与 DTO 的协议枚举，使新增/编辑/发现接口接受四种协议值并原样回传 `custom.protocol`；验证方式为 `services/buildr/test/integration/model-access.test.ts` 覆盖四种协议与未知值拒绝，运行 `npm --prefix services/buildr test:integration` 通过。（实际结果：`operation-schemas.ts` 的 `customConfig`/`customConfigure`/`customDiscovery` 改为四值枚举；集成测试覆盖四种协议的新增、发现、认证头/端点差异、未知协议 `openai-responses`/`gemini-vertex` 拒绝与 `custom.protocol`/`modeLabel` 回传；定向运行 `node --import ./test/register-development-entry.ts --test test/integration/model-access.test.ts` 通过 1/1。执行前先经 `npm run agent:prepare` 同步 agent 构建产物。）
- [x] 7.6 在自定义供应商表单增加协议选择（OpenAI 兼容 Chat Completions、OpenAI Responses、Anthropic Messages、Gemini），编辑时回填已保存协议，保存与发现请求传递所选协议，并按协议提示实际调用地址；验证方式为 `npm --prefix services/buildr-web run test:static` 与单元测试覆盖协议回填和请求参数。（实际结果：表单协议下拉、编辑回填、保存/发现透传与按协议的端点提示已实现，账户视图透传 `custom.protocol`，卡片文案按 `modeLabel` 显示协议；`custom-provider-model.test.mjs` 覆盖四协议选项与端点提示，`account-model-view.test.mjs` 覆盖协议透传；定向测试 15/15、`npm test` 与 `npm run test:static` 通过。）
- [x] 7.7 更新 `knowledge/docs/architecture/agent-integration.md` 的自定义供应商章节，说明四种协议的端点、认证、发现差异与 Gemini 转换边界；验证方式为回读文档与实现和规范一致，并更新 `.buildr/knowledge-impact.yml`。（实际结果：文档自定义供应商两段已改为四协议口径，覆盖协议选择/回填、各协议端点与认证头、Anthropic/Gemini 有界分页与能力过滤、Gemini 仅作上游协议的转换边界；`.buildr/knowledge-impact.yml` 的 reason 与 sourceIdentities 已同步协议与转换实现文件。）
- [x] 7.8 重新收敛验证：运行 `npm --prefix services/buildr-agent run test:static`、`npm --prefix services/buildr-agent test`、`npm --prefix services/buildr-web run test:static`、`npm --prefix services/buildr-web test`，并在预览中用四个本地假端点分别完成新增、发现、流式推理与工具调用核对；保留截图与操作记录，已有既有集成失败按实际情况记录。（实际结果：agent `test:static` 通过、单元 316 通过；buildr-web `test:static` 与 `npm test` 通过；本改动直接相关的 `test/integration/model-access.test.ts`、`test/integration/model-providers.test.ts` 45 通过 / 0 失败。托管预览中用 `127.0.0.1:45873` 的单进程假端点（`/chat`、`/responses`、`/anthropic`、`/gemini`）完成四个 BYOK 供应商的新增、发现、保存与启用，并经 DSH 对话逐一完成流式最终答复与工具调用往返；上游日志显示每协议 4 次 POST：非流式标题请求、带 31 个工具的流式首轮、辅助流式请求、带工具结果的流式收尾轮。截图与日志保存在 `/tmp/byok-verify/`（07–12 新增/发现/启用、15 模型选择、20/21/22 各协议流式与工具调用、`gemini-stream` 修复后复跑；`upstream.log` 与修复前 `upstream.pre-fix.log`）。密钥隔离核对：`accounts.json` 无密钥原文，四个账号的 `model-api-key.json` 权限均为 0600；上游分别收到 `authorization`、`x-api-key`、`x-goog-api-key`。验证中发现并修复一个真实缺陷：`translateRequest` 翻译到 Gemini 时丢弃 `stream`，导致自定义运行时对 Gemini 上游始终走非流式 `:generateContent`；已保留该标记（发送前仍由运行时剔除），补充跨层回归断言，修复后 Gemini 工具轮改用 `:streamGenerateContent?alt=sse`。既有无关集成失败 `conversation-unknown-settlement.test.ts:42` 仍在，故 6.3 保持未勾选。预览实例已停止并在收尾时按任务归属 `stop --purge` 清除实例根（同 6.4），`preview prune` 无孤儿残留；假上游已停止。）
