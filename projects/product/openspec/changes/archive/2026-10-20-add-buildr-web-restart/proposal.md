# 重启 Buildr Web

## Why

Buildr Web 顶栏目前只有「退出」入口。开发调试中常见的诉求是让本机服务重启生效——加载新构建、清理进程内状态——用户只能先退出整个服务，再从 CLI 或 Launcher 手动重新启动，浏览器地址与所有已打开标签全部失联。现在引入重启，是因为重启所依赖的进程交接机制（Launcher 更新交接、认证退出、启动锁、实例回执）已经存在并经发布流程验证，可以以很小的增量提供完整能力。

## What Changes

- 顶栏「退出」按钮改为拆分按钮：主按钮「重启 ⌄」（`id=restart-buildr`）一键触发重启；下拉菜单项「退出 Buildr Web」保留既有 `id=quit-buildr`、危险确认框与失败重试入口。
- 新增 HTTP 操作 `POST /api/v1/app/restart`：与 `quit` 相同的 Origin/会话令牌认证、闭合空请求、202 响应与统一错误 envelope；非法请求不产生副作用。
- 新增同身份重启接管：旧实例响应后 spawn 同一产品入口的后继进程（`buildr web --restart <观察摘要> --port <原端口> --no-open`）；后继进程在启动锁内复用既有认证退出、启动锁、记录清理与健康验证，请旧实例退出并绑定原端口、写实例回执。released 与 development 渠道均适用；Preview 实例不提供入口。
- 页面恢复：请求返回后页面进入「正在重启」状态，轮询当前页直到注入的会话令牌（session token）变化，随后整页刷新；超时或无法确认新实例时提示重试与手动重新打开。
- 无破坏性变更：不改 `quit`/`quit-instance` 语义、不改变退出行为、不公开 `buildr web restart` CLI 命令、不新增公开状态端点。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `runtime-system-http-contracts`: Buildr Web host operation 要求扩展，新增 `restart` 操作的认证、请求/响应 Schema、响应先于交接、非法请求无副作用等语义。
- `buildr-web-instance-lifecycle`: 生命周期要求扩展，新增同身份重启接管（restart handoff）：启动锁内核对实例、认证退出旧实例、绑定原端口、失败保留现场；同时约束 Preview 实例不适用。
- `buildr-web-client`: App Shell 顶部操作要求扩展，退出入口改为拆分按钮并新增重启入口；新增重启进行态、令牌变化探测与自动恢复行为。

## Impact

- `services/buildr`：`web/http/buildr-web-http-contracts.ts`（新 operation 与 Schema）、`web/http/router.ts`（新路由）、`web/http/server.ts`（交接端口）、`web/application/instance-lifecycle.ts`（`--restart` 启动路径与同身份接管）、`web/infrastructure/instance-runtime.ts`（必要时扩展重启 spawn 辅助）；受影响测试包括 HTTP 契约、系统级 `system-app-process`/`system-buildr-web-http` 与 `update-web-handoff` 相关测试。
- `services/buildr-web`：`src/app/AppLayout.tsx`（拆分按钮、重启状态与轮询）、`src/app/api/runtime-system-api.ts`（restart 客户端）、`build/generated/` 重新生成 DTO；浏览器验收对 `id=quit-buildr` 改为先展开下拉、新增 `id=restart-buildr` 旅程。
- 兼容：实例回执、启动锁、`quit-instance` 实例密钥认证与 `--update-handoff` 语义保持不变；旧版本实例无 `restart` 端点，新版页面对其调用时按普通错误处理。
