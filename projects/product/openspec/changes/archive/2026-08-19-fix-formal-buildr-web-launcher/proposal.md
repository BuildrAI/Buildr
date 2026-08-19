## Why

当前正式 npm Launcher 使用随机端口，并在 macOS 上以前台 shell wrapper 持有 Web 进程，导致入口地址不稳定，且 Launcher 已启动后再次点击会被 LaunchServices 以 `-600` 拒绝。正式入口需要稳定、可配置且可恢复的端口策略，同时必须保持 npm installation binding 与 development profile 隔离。

## What Changes

- 正式 npm Launcher 默认首选 loopback 端口改为 `4457`，并把端口策略保存到 closed Launcher binding。
- `buildr web launcher install|repair` 支持指定首选端口或 `0` 随机端口；默认首选端口不可绑定时，正式 Launcher 安全回退到一次随机端口启动并记录实际 URL。
- 普通 `buildr web --port <port>` 与 Development Launcher 的既有端口语义保持不变，正式 Launcher 继续只复用 matching released profile 的健康实例。
- macOS 正式 Launcher 改为短生命周期入口，使首次打开与重复打开都能启动或复用同一正式 Web 实例，并保留 Node、package entry、binding digest 校验、日志与失败提示。
- 增加 binding、端口占用回退、重复启动和未发布本地 npm candidate Launcher 的验证覆盖。
- 本 Change 不包含 npm 发布、开发版页面标识、签名或公证。

本变更会调整正式 Launcher 的默认端口和 binding schema，属于正式本机入口的兼容性行为变化；不会改变 Workspace 数据、HTTP API 或 development profile。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-channel-isolation`: 调整 released profile 的 Launcher 端口与重开生命周期，同时保持 development profile 的随机端口和双 profile 隔离。

## Impact

- 影响 `src/infrastructure/product-launcher`、Launcher binding、`web launcher` CLI、Local App Server 启动策略及相关 system/release verification。
- 正式 Launcher 新安装或 repair 后默认访问 `http://127.0.0.1:4457`；端口冲突时实际 URL 由 instance receipt 和启动日志报告。
- 不增加外部依赖，不修改正式 npm 发布流程，也不直接覆盖当前用户 Launcher。
