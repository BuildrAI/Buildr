# 1. 多工作树源代码状态读取性能收敛

- [x] 1.1 在 `checkout-read-identity`、`code-file-reader`、`code-worktree-reader` 与 `code-worktree-catalog` 中提供异步并发检出身份解析并复用当前请求已核实的 `commonDirectory`。
- [x] 1.2 在 `source-control-application` 与 `code-application` 中将单仓缓存复用项与新增状态读取项合并为单次批量 `prepareVerification` / `prepareVerificationAsync` 收束，并补充多工作树集成测试验证调用计数与身份安全边界。

# 2. 模型目录按版本增量复用

- [x] 2.1 在 `buildr-agent` `operation-schemas.ts` 与 `buildr` `agent-service-http.ts` 中支持 `GET /api/v1/app/agent-service/model-catalog?revision=<sha256>`，重新生成前后端契约 DTO，并更新 `agent-conversations-api.ts` 与受影响浏览器测试匹配规则。
- [x] 2.2 通过 HTTP 集成测试、前端单测、契约校验及类型检查验证全部更改与既有兼容场景。

# 3. 非代码视图下按需延后源代码观察

- [x] 3.1 在 `source-control-observer.ts` 中新增 `active` 开关与 `setActive`，并在 `WorkspaceSourceControlProvider.tsx` 与 `AppLayout.tsx` 中绑定可见代码视图状态，在非代码区域或全屏专注对话时暂停后台观察与监听。
- [x] 3.2 在 `source-control-observer.test.mjs` 中补充非代码视图静默、手动刷新与激活后立即补查恢复的单元测试，并通过前端类型检查与单测。
