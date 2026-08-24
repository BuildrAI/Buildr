## Why

Buildr Web 默认实例与 Preview 的运行策略目前散落在 `interfaces/local-app/runtime`、HTTP Server 和 Bootstrap CLI 组装中，导致实例生命周期的业务编排与 HTTP 宿主、通用进程机制边界不清。现在 Bootstrap 模块合约与通用 Infrastructure 已具备迁移基础，应先收敛这一窄切片，为后续独立迁移 HTTP 公共宿主降低并行冲突。

## What Changes

- 新增扁平的 `web/application` 与 `web/infrastructure` 技术分层，迁移默认实例和 Preview 的启动、复用、停止、端口、PID、锁、Secret、维护、异常恢复与资源清理职责。
- 新增 `web/module.mjs` 及窄 CLI 贡献入口，通过既有 Bootstrap 模块合约注册 Web 生命周期能力；Bootstrap 不再直接拥有实例策略。
- 通用进程、网络、filesystem、锁和平台机制继续复用全局 Infrastructure；Web Infrastructure 只保存 Web 实例运行状态和适配，不产生第二套通用实现。
- 移除完成迁移后的旧生命周期入口，并同步更新 imports、Application Payload、Verification owner 与相关自动测试。
- 保持现有公开 CLI、HTTP、JSON、端口选择、实例复用、Launcher 交接、Preview ownership、SQLite schema 与运行副作用不变。
- 不迁移 HTTP Router、Controller、Session、安全边界、静态文件托管、`web-dist` 构建或 sibling `buildr-web` React/Vite 源码。
- 本变更不包含破坏性变更。

## Capabilities

### New Capabilities

- `buildr-web-instance-lifecycle`: 定义 Web 默认实例与 Preview 生命周期的模块所有权、Bootstrap 接入、技术机制复用和行为等价边界。

### Modified Capabilities

无。

## Impact

- 受影响实现：`projects/product/services/buildr/src/interfaces/local-app/runtime`、相关 Application 编排、Bootstrap module/CLI registry、Application Payload inventory 与架构验证。
- 受影响测试：默认实例运行时、Preview ownership、scheduled maintenance、Bootstrap module contract、package/runtime inventory 与 changed-path owner coverage。
- 不影响外部 API、数据模型、数据库、前端源码、HTTP 宿主安全语义或发布构建 authority。
