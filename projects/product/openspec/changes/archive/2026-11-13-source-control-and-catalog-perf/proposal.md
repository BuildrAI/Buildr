## Why

1. 当工作空间关联多个 Git 工作树（Worktree）时，`/api/v1/workspaces/:workspaceId/code/source-control` 的状态读取仍对每个已缓存检出逐一同步调用 `prepareVerification([source])`，并在工作树枚举与校验期间串行执行多次重复的 `git worktree list`、`git rev-parse --git-common-dir` 与身份解析子命令，造成多工作树刷新耗时偏高（约 500–1,250 ms）。
2. 主对话上下文与相关面板会周期性请求 `GET /api/v1/app/agent-service/model-catalog` 核对可用模型，在模型账号与目录未变化时仍每次返回约 65 KB 的完整目录响应。
3. 用户在非代码页面或全屏专注对话期间，壳层仍持续维持 `source-control-watch` 并在智能体写文件时触发后台 `source-control` 刷新。

## What Changes

- 批处理与并发化多工作树源代码状态读取与收束校验：单个仓库内复用已验证的 `commonDirectory`，并将所有待确认工作树（含命中的观察缓存与新读取状态）合并为单次批量 `worktree list` 与有界并发异步身份核对，保持所有目录身份、注册边界、10 秒观察生命周期和保守元数据失效语义不变。
- 为 `GET /api/v1/app/agent-service/model-catalog` 与 `AgentModelCatalog` 契约增加可选 `?revision=<sha256>` 查询参数以及 `{ revision, unchanged: true }` 未变化短响应，并更新 `agentConversationsApi.modelCatalog()` 在同次浏览器会话中按版本号增量复用上次目录；不带 `?revision` 的既有调用继续返回完整目录与 `revision`。
- 为 `createSourceControlObserver` 增加 `active` 控制并在 `AppLayout` / `WorkspaceSourceControlProvider` 中绑定可见代码视图状态：处于非代码区域或全屏专注对话时暂停 `source-control-watch` 与后台状态扫描，进入可见代码视图或手动刷新时立即补查恢复。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `web-read-efficiency`：增加模型目录按版本轻量核对与非代码视图下按需延后源代码观察需求，保持无版本参数调用方与既有权限、错误响应兼容。

## Impact

- 后端代码状态读取：`projects/product/services/buildr/src/infrastructure/git/checkout-read-identity.ts`、`projects/product/services/buildr/src/modules/code/...`
- 智能体 HTTP 契约与服务端：`projects/product/services/buildr-agent/src/operation-schemas.ts`、`projects/product/services/buildr/src/modules/agent-service/interfaces/http/agent-service-http.ts` 及生成 DTO
- 前端客户端、代码观察壳层与测试：`projects/product/services/buildr-web/src/features/agent-conversations/api/agent-conversations-api.ts`、`projects/product/services/buildr-web/src/features/code/source-control-observer.ts`、`projects/product/services/buildr-web/src/app/WorkspaceSourceControlProvider.tsx`、`projects/product/services/buildr-web/src/app/AppLayout.tsx` 及受影响测试
