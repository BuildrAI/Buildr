## Why

正式 `Buildr Web` Launcher 当前会直接复用同一 Web profile 中由前台 CLI 启动的健康实例，但不会把该实例转换为 Launcher 托管进程。用户点击图形入口后会误以为服务已经具备后台连续性；原终端结束时服务仍会退出，并可能留下陈旧实例记录。

## What Changes

- 区分 Web 实例的运行兼容性与 Launcher 连续性所有权；Launcher 只直接复用 binding identity 精确匹配的实例。
- 当 Launcher 遇到可认证、同 profile、由普通 CLI 启动的健康实例时，在单实例锁内完成有界优雅交接，再由当前 Launcher binding 启动并验证新实例。
- ownership 不匹配、无法认证或交接超时时保持 fail closed，不强杀进程，也不启动并行写实例。
- 为异常终止补充 `SIGHUP` 清理，并增加 CLI 到 Launcher 交接、并发启动和失败保留现场的回归测试。
- 不改变 npm/Development Launcher 通道隔离、公开退出动作、Workspace 数据或 Launcher 安装模型；不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `local-workspace-application`: 明确正式 Launcher 面对非 Launcher 托管健康实例时的连续性交接、ownership 校验、失败关闭和就绪证明。

## Impact

- 影响 `buildr` Service 的 Web Runtime 实例管理、Launcher 启动路径和相关 integration/system tests。
- 影响 `local-workspace-application` canonical requirement；不改变公开 CLI 名称、binding schema、HTTP API、前端页面或外部依赖。
