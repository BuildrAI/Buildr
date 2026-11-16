## Why

当前使用 Antigravity（含搭配 Google 个人账号的模型如 Gemini / Orchestrator）时，Buildr 的 `AntigravityRuntime` 未实现独立的 `generateTitle`，且 `agy` 工作会话自身推送的 `session_info_update` 多为英文标题（如 `"Buildr Session Auto Recovery"`），会直接覆盖首条中文用户消息生成的中性/兜底标题。同时，模型网关的通用标题提示词对语言限制不够明确，有时也会受对话英文术语影响输出纯英文标题。

## What Changes

- **Antigravity 独立隔离中文智能标题生成**：在 `AntigravityRuntime` 实现独立于工作会话的 `generateTitle`，通过私有空临时目录启动不带 `--dangerously-skip-permissions`、禁用 MCP 与一切工具的辅助 `agy acp` 会话，校验同账号绑定后优先选用轻量低思考档位模型（orchestrator 模型自动降档至轻量模型），明确要求生成简体中文精短标题（12–18 字、最多 24 字，必须包含中文）并以 JSON 契约校验输出。
- **防止英文原生标题中断或覆盖中文标题**：在 `ConversationApplication.acceptTitle` 中阻止原生 `title` 事件打断正在进行中的独立智能标题或待补充尝试，并拒绝 Antigravity 推送不含中文字符的原生标题。
- **网关标题提示语显式锁定简体中文**：更新 `generateModelTitle` 提示语，使模型网关通道生成标题时统一输出简体中文精短标题，禁止输出纯英文标题。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `antigravity-cli-execution`: 新增对 Antigravity 独立无工具辅助会话生成简体中文智能标题及拒绝纯英文原生覆盖的要求。
- `agent-conversations`: 完善自动标题要求，明确网关标题提示输出简体中文，并规定原生标题事件不得打断在途独立标题请求或覆盖合法兜底标题为纯英文原生标题。

## Impact

- `projects/product/services/buildr-harness`: `executors/model-title.ts`、`executors/antigravity/coordinator.ts`、新增 `executors/antigravity/title.ts`、`executors/antigravity/index.ts`、`application/conversation-application.ts`。
- `projects/product/services/buildr-harness/test`: `unit/model-title.test.ts`、`integration/executors/fixtures/antigravity-acp.mjs`、`integration/executors/antigravity.test.ts`、`integration/conversations.test.ts`。
