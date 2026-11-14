## 1. 契约与共用轻量低推理通道

- [x] 1.1 在 `contracts.ts` 中为 `ExecutorTitleInput` 增加可选 `reasoningEffort`，为 `AgentServiceOptions` 增加可选 `titleTimeoutMs`。
- [x] 1.2 在 `executors/model-title.ts` 中导出 `lowestReasoningEffort`、`titleTokenCap` 与 `titleAbortError`，并支持 `generateModelTitle` 传递最低推理强度、思考场景输出 token 上限与精确超时/取消中止归因（兼容 `AbortError` 名称）。

## 2. 执行器通道与 Google AI 代理修复

- [x] 2.1 在 `model-access/providers/google-ai-proxy.ts` 中调整 `infer()` 推理强度解析优先级为请求显式强度优先于会话租约默认 `input.reasoningEffort`。
- [x] 2.2 将 `CodexRuntime.generateTitle` 的网关分支改走无工具轻量 `generateModelTitle`（`/chat/completions`），原生分支将最低可用 `effort` 传入 `generateCodexTitle` 的 `turn/start` 并同步 `titleAbortError`。
- [x] 2.3 为 `ClaudeRuntime`、`DshRuntime`、`QoderRuntime` 与 `QoderCnRuntime` 的网关标题分支统一接入 `lowestReasoningEffort` 与 `titleTokenCap`（保持 Qoder 原生 `/chat` 与非思考模型 128 上限兼容）。

## 3. 对话应用超时预算、精准归因与首轮完成补试

- [x] 3.1 将 `ConversationApplication` 标题外层超时提升至 30 秒并支持 `options.titleTimeoutMs`（经 `agent-service.ts` 透传），在 `summarizeTitle` 中以 `new Error('agent_title_timeout')` 中止并通过 `within()` 与 `titleAbortError` 区分超时与外部取消；向 `runtime.generateTitle` 传递当前模型目录声明的最低可用推理强度。
- [x] 3.2 实现首轮流式运行期间瞬态失败在首轮成功完成且产出可见助手回复后的单次自动补试逻辑，确保未完成、非瞬态失败、后续轮次、切执行方、刷新与重启绝不重试。
- [x] 3.3 同步更新 `knowledge/docs/architecture/agent-integration.md` 中的对话标题生成说明。

## 4. 单元与集成测试及全量验证

- [x] 4.1 补充 `test/unit/model-title.test.ts` 与 `test/integration/google-ai-proxy-lifecycle.test.ts` 测试，覆盖最低推理强度选择、输出上限切换、请求级推理强度优先路由及超时与取消信号归因。
- [x] 4.2 补充 `test/integration/executors/model-titles.test.ts` 与 `test/integration/conversations.test.ts` 测试，覆盖 Codex 网关轻量 `/chat/completions` 标题请求、原生 `effort` 透传、真实超时记录 `agent_title_timeout`，以及首轮流式瞬态失败后完成态单次补试成功、双次失败、被停止不补试与非瞬态不补试边界。
- [x] 4.3 执行四服务全量检查（`npm run check`）及受影响集成测试并全部通过。
