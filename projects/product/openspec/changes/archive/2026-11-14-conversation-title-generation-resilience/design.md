## Context

一次线上真实对话（`gemini-4-carbon-high` + Codex 执行方）出现了以下症状：`titleOrigin` 停留在 `fallback`，`titleState` 记录为 `[agent_title_cancelled] 独立标题请求已取消；当前标题已保留`。日志核对显示用户消息发出 10 秒整后即取消标题请求，而主工作轮次此时仍在流式等待模型响应并在约 20 秒后正常结束。

深入排查源码（包括近期刚合并的 Google AI 模型系列与思考深度映射逻辑）发现四个相互叠加的问题：
1. `CodexRuntime.generateTitle` 在使用 Buildr 本地模型网关（`this.gateway`）时，仍沿用原生 `codex app-server` 的 `config/read -> thread/start -> turn/start` 三段式临时线程流程，并由临时线程经 Responses 接口回调本机模型网关，既增加了进程调度和首包开销，又未显式降级推理强度；
2. `google-ai-proxy.ts` 在 `infer()` 中将租约默认的 `input.reasoningEffort` 排在请求体字段之前（`input.reasoningEffort ?? reasoning?.effort ?? ...`），即使上游辅助请求显式传入低推理强度，仍会被会话租约的 `'high'` 强制覆盖为 `*-high` 变体；
3. `ConversationApplication.summarizeTitle` 使用 `TITLE_TIMEOUT_MS = 10_000` 并触发无参 `controller.abort()`，`within()` 的 `signal.addEventListener('abort', ...)` 与 `generateCodexTitle` 的 `abort` 回调无条件拒绝为 `agent_title_cancelled`，导致真实超时被掩盖成“已取消”，且 10s 小于 `generateCodexTitle` 的 30s 内部等待；
4. 首轮在并发峰值期超时失败时立即持久化 `failed` 并封死整段对话所有自动补救机会，哪怕几秒后首轮本身已经成功给出了明确助手回复。

## Goals / Non-Goals

### Goals
- Codex 网关模式统一通过无工具轻量 HTTP `generateModelTitle` 生成标题，不触发原生 `codex app-server` 临时线程。
- 标题生成辅助请求按模型目录声明自动挑选最低推理强度，并由 Google AI 本地代理按请求显式强度优先映射到低推理上游模型（不影响同一对话租约下后续工作轮次的推理强度）。
- 将外层标题生成超时对齐到 30 秒，且严格区分外层超时（`agent_title_timeout`）与外部主动取消（`agent_title_cancelled`，包括兼容既存取消调用期望的 `AbortError` `.name` 特征）。
- 在保持“首轮立即兜底 + 并行首试、非首轮/切人/刷新/重启不自动重试”的核心原则下，为“首轮流式期间的瞬态标题失败”提供且仅提供一次“首轮成功完成且有可见回复后”的自动补试。

### Non-Goals
- 不引入跨服务重启或跨轮次的多轮持久重试队列，也不新增持久化的标题重试计数表字段。
- 不改变 Qoder 原生 `/chat` 标题通道的模型目录路由和 `parameters.max_tokens = 128` 兼容约定。
- 不更改前端标题编辑、手动重命名优先权或显式触发“生成简短标题”的用户交互协议。

## Decisions

### Decision 1: `CodexRuntime.generateTitle` 在网关模式切换为 `generateModelTitle`
- **选择**：当 `this.gateway` 存在时，`CodexRuntime.generateTitle` 直接向 `this.gateway.baseUrl + '/chat/completions'` 发送无工具、单轮结构化 `generateModelTitle` 请求；仅在无网关的原生 Codex 登录/自定义模式下保留隔离 `generateCodexTitle`（`thread/start` 临时只读线程）并将服务传入的最低可用 `reasoningEffort` 附加至 `turn/start.effort`。
- **取舍与原因**：DSH、Claude Code、Qoder 与 Qoder-CN 在网关模式下均已统一采用轻量 HTTP 请求。Codex 网关模型能力同样通过 `ModelGatewayLease` 暴露于 `/v1/chat/completions`，直接调用 `generateModelTitle` 可省去 `config/read` / `thread/start` / `thread/unsubscribe` 的进程往返并完全复用重试与严格输出校验逻辑。注意 `ClaudeRuntime.generateTitle` 继续使用 `/messages`（`anthropic-messages`），`lowestReasoningEffort` 对 Claude 仅从其合法枚举 `low | medium | high | xhigh | max` 中选取，避免不支持的字符串误触兼容拒单。

### Decision 2: 最低推理强度（`lowestReasoningEffort`）与思考模型输出上限（`titleTokenCap`）
- **选择**：在 `executors/model-title.ts` 集中定义按弱到强排序的 `lowestReasoningEffort`（`off/none/disabled < minimal < small/light/low < medium < high/large < xhigh < max < ultra`），以及 `titleTokenCap(maxOutputTokens, reasoningEffort)`：当推理档位明确为关闭（`off`/`none`/`disabled`）或模型未声明活跃思考档位时保持 `128`（受模型上限截断）；当标题请求携带活跃思考档位（如 `minimal`/`low`）时允许上限放宽至 `Math.min(512, maxOutputTokens ?? 512)`，防止部分思考模型在 128 token 内尚在 `<think>` 即被截断为 `finish_reason: 'length'` 从而触发 `agent_title_output_invalid`。
- **兼容考虑**：Qoder 与 Qoder-CN 对非思考模型或原生 `/chat` 的单测显式断言 `max_tokens <= 128` 或 `{ max_tokens: 128 }`；本方案在无活跃思考档位时仍精确发出 `128`，完全向后兼容既有单元测试。

### Decision 3: Google AI 本地代理请求级推理强度优先于租约默认值
- **选择**：在 `google-ai-proxy.ts` 的 `infer()` 中将解析顺序从 `input.reasoningEffort ?? reasoning?.effort ?? body.reasoning_effort ?? outputConfig?.effort` 调整为 `reasoning?.effort ?? body.reasoning_effort ?? outputConfig?.effort ?? input.reasoningEffort`。
- **安全性分析**：同一 `ModelGatewayLease` 同时服务于该对话当前轮的主执行（常规工作轮次由执行器或协议层传入用户选择的 `input.reasoningEffort`，或由租约默认值兜底）与该对话独立的辅助标题请求（标题请求显式携带最低强度）。请求级字段优先不会改变工作轮次的选择，相反能精准确保单次低推理标题请求映射到 `*-low`，同时未附带思考字段的常规或历史请求仍稳定回退至 `input.reasoningEffort`。

### Decision 4: 基于中止原因（Abort Reason）精确区分超时与取消
- **选择**：`ConversationApplication.summarizeTitle` 使用 `TITLE_TIMEOUT_MS = 30_000`（并支持通过可选测试注入选项 `AgentServiceOptions.titleTimeoutMs` 构造快速真实的毫秒超时用例）；超时计时器触发 `controller.abort(new Error('agent_title_timeout'))`。新增共用辅助 `titleAbortError(signal)`：仅当 `signal.reason` 为 `Error('agent_title_timeout')` 时返回 `Error('agent_title_timeout')`；否则返回 `Error('agent_title_cancelled')` 且保留 `error.name = 'AbortError'`。`within()`、`generateModelTitle()`（覆盖 `throwIfAborted`、`fetch`、`readTitleBody` 与退避 `delay`）及 `generateCodexTitle()` 全部统一走该语义。
- **兼容性**：既保证 `within` 与 `generateCodexTitle` 在真实超时时产生精确诊断 `[agent_title_timeout]`，又保留外部取消时 `error.name === 'AbortError'` 与既有一致性集成测试兼容。

### Decision 5: 首轮流式瞬态失败后的完成后单次自动补试状态设计
- **选择**：不向持久化对话实体增添新的长周期重试标记字段；在 `ConversationApplication` 内存中以 `runId` 为键维护 `pendingTitleRetries: Map<string, unknown>`，仅覆盖当次进程内正在进行的首轮执行：
  1. 当且仅当早期自动请求在首轮尚处于非 `completed` 状态（`startedWhileRunning === true`）发起，且失败归因属于可重试瞬态码（`agent_title_timeout`、`agent_title_failed`、`agent_title_transport_closed`、`agent_native_process_closed`、`agent_native_request_failed`）时允许触发完成后单次补试：
     - 若首轮此时仍在执行中，暂不写入 `failed`，将 `titleState` 从 `generating` 复位为 `fallback` 并记录 `pendingTitleRetries.set(runId, error)`；
     - 待 `execute()` 正常观察到首轮变为 `completed` 且具备可见助手回复、标题仍为 `fallback` 时，消费并删除 `pendingTitleRetries`，立即携带首轮用户消息与助手回复执行至多一次自动补试；
     - 若早期请求结束时刻首轮恰好已 `completed` 且存在可见助手回复，则在释放当前 `titleWork` 锁后直接衔接这一次完成态补试；
     - 若首轮最终以 `stopped`/`failed`/`unknown` 结束或进程在 `finally` 退出且仍未完成，立即将暂存的原始失败原因落盘至 `titleState = { status: 'failed', reason }` 并清理 `pendingTitleRetries`。
  2. 非瞬态错误（如 `agent_title_unavailable`、`agent_title_invalid`、`agent_title_empty`、`agent_title_output_invalid`、`agent_title_tools_forbidden`、`agent_title_isolation_unverified`、`agent_title_cancelled`）或发起时刻首轮已 `completed`（含极快同步返回场景），维持原行为直接落盘且不补试。
- **边界优势**：无数据库 schema 侵入，服务重启或页面刷新后天然不重试；手动命名和原生标题在任意时刻到达依然拥有更高优先级并阻止补试；补试自身仍受有界 30 秒超时与单轮至多一次约束。

## Risks / Trade-offs

- **风险 1**：部分不完全兼容 OpenAI `reasoning_effort` 的第三方自定义 Chat Completions 网关收到未知字段时，理论上有返回 400 的可能性。
  - **缓解**：仅当模型自身在目录中明确声明了 `reasoningEfforts` 选项时才提取 `lowestReasoningEffort` 并发送 `reasoning_effort` / `output_config.effort`；对未声明任何推理强度的普通模型，请求体完全不附加任何推理字段，保持与此前逐字节一致的载荷格式。
- **风险 2**：若首轮持续时间极短，早期自动请求耗时较长而跨过了首轮完成时刻才超时失败，补试请求会在首轮返回给客户端后继续后台运行。
  - **缓解**：所有标题任务仍纳入 `titleWork` 登记、`activity()` 统计与 `scheduleSourceRelease` 空闲源释放等待边界；服务优雅关闭时统一中止所有 `titleWork` 并正常释放连接，不会泄漏孤儿进程或阻断手动改名。
