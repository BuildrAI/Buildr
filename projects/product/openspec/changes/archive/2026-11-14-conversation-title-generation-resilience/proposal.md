## Why

在当前对话标题自动生成链路中，高思考深度模型（如通过模型网关运行的 Codex `gpt-5.x` 或 Google AI 系列模型 `gemini-4-carbon-high`）存在四重耦合缺陷，导致标题生成频繁失败并误报为“已取消”：

1. **Codex 网关标题通道过重且默认推理强度过高**：`CodexRuntime.generateTitle` 在本地模型网关（`this.gateway`）模式下仍启动完整的 `codex app-server` 临时线程（依次执行 `config/read`、`thread/start`、`turn/start`），而 DSH、Qoder 等网关执行器已直接走无工具轻量 `/chat/completions` 接口；同时标题请求未指定最低推理强度，易以模型默认中高思考深度参与首轮并发限流。
2. **Google AI 本地代理覆盖了请求级推理强度**：`google-ai-proxy.ts` 在解析上游变体模型时优先采用会话租约的 `input.reasoningEffort`，导致标题生成等辅助请求即便在请求体显式指定低推理强度（`low`），也会被强行映射回高推理模型（如 `gemini-4-carbon-high`）。
3. **标题超时归因错误且外层预算偏短**：`ConversationApplication.summarizeTitle` 使用无参 `controller.abort()` 中断 10 秒超时请求，使 `within()` 和 `generateCodexTitle()` 的 `abort` 监听器抢先以 `agent_title_cancelled` 拒绝，掩盖真实的 `agent_title_timeout`；同时 10 秒外层超时低于 `generateCodexTitle` 承诺的 30 秒内部预算，与跨层时间预算一致性要求冲突。
4. **首轮流式瞬态失败缺少完成后补试**：当首轮执行仍在流式进行中且标题仅尝试过早期的用户首句摘要，若此时因上游超时或瞬态传输抖动失败，即便首轮最终成功完成并产出完整助手回复，也不会补充生成一次，用户只能一直看到截取后的兜底标题。

## What Changes

- **轻量低推理模型标题通道**：`CodexRuntime.generateTitle` 在网关模式下直接走与工作线程完全隔离的无工具 `generateModelTitle`（`/chat/completions`），不再创建临时 `codex app-server` 线程；各执行器的网关标题请求及 `ConversationApplication` 传入的辅助标题提示统一选取模型声明的最低可用推理强度（如 `none`/`minimal`/`low`），当启用了活跃思考档位时将输出上限从 128 弹性放宽至 `min(512, maxOutputTokens)`，避免思考 token 耗尽输出长度预算。
- **Google AI 请求级推理强度优先**：修正 `google-ai-proxy.ts` 的 `infer()` 解析顺序，优先采纳单次请求体显式传入的推理强度（`reasoning.effort`、`reasoning_effort`、`output_config.effort`），仅在请求未显式指定时回退使用会话租约默认的 `input.reasoningEffort`，不修改常规对话轮次的推理强度。
- **精确区分超时与外部取消并统一 30 秒预算**：将 `TITLE_TIMEOUT_MS` 提升至 30 秒以对齐跨层时间预算；外层超时显式传入 `new Error('agent_title_timeout')` 作为中止原因，`within()`、`generateModelTitle()` 与 `generateCodexTitle()` 统一依据信号原因区分超时（`agent_title_timeout`）与外部取消（`agent_title_cancelled`）。
- **首轮流式瞬态失败在回复完成后的单次自动补试**：保留首次受理轮次“立即兜底 + 并行首试”的主路径；仅当首轮仍在流式运行期间发起的早期自动标题因超时、网络断开或临时服务故障等瞬态原因失败、且首轮最终成功完成并具备可见助手回复、标题仍处于 `fallback`（未被手动命名或原生标题覆盖）时，系统自动携带用户消息与助手回复补充尝试至多一次。若首轮未完成、无可见助手回复或失败属于不可恢复原因（能力不可用、输出超限、结构化无效、禁止工具、隔离未确认、外部取消），则保持原地落盘失败状态；后续用户消息、切换执行方、刷新与重启均不自动重试。

## Capabilities

### New Capabilities

- 无新增 capability。

### Modified Capabilities

- `agent-conversations`: 更新《自动标题必须是与工作上下文隔离的简短摘要》契约，明确网关执行方轻量低推理标题通道、30 秒跨层超时预算与超时/取消精准归因，以及首轮流式瞬态失败在首轮回复完成后的单次自动补试边界。

## Impact

- 影响范围限于 `projects/product/services/buildr-agent` 的对话应用服务（`conversation-application.ts`）、执行器标题通道（`executors/model-title.ts`、`codex`、`claude`、`dsh`、`qoder`、`qoder-cn`）及 Google AI 本地代理（`google-ai-proxy.ts`），以及对应的产品架构知识文档与单元/集成测试。
- 无需数据库迁移，不修改 Buildr 任务与 OpenSpec 存储格式，不属于破坏性 API 变更（`AgentServiceOptions.titleTimeoutMs` 与 `ExecutorTitleInput.reasoningEffort` 均为可选向后兼容字段）。
