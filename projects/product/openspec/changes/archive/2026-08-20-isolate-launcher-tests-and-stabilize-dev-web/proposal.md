## Why

当前产品验证会在少数路径调用真实平台启动器（Platform Launcher）并打开系统默认浏览器，测试结束时可能触发错误弹窗、遗留失效标签页，甚至影响正在使用的开发版 Buildr Web。与此同时，Buildr Web Dev 使用随机端口，导致 Launcher 重装或自举同步（Self-bootstrap Sync）后入口不稳定；这些副作用会让验证流程反过来干扰开发工作。

## What Changes

- 普通自动验证统一使用隔离的无界面模式（Headless Mode）：临时数据根、随机端口、`--no-open`，不得调用真实 Launcher 图形界面、系统通知或默认浏览器。
- 将平台启动入口集成（Platform Launcher Integration）从普通 affected/full 验证中分离为显式、可选、按操作系统运行的验收；该验收验证平台入口，但仍不打开浏览器或显示弹窗。
- Development Launcher 为 Buildr Web Dev 绑定固定默认端口 `4458`；端口被外部进程占用时明确失败，不静默切换随机端口。
- 自举同步保留安装前的运行意图：原开发实例健康运行时，在 Launcher 更新后以新入口恢复到固定端口并验证身份；原实例未运行时继续按需启动。
- Launcher 只把真正的启动失败报告为用户可见故障，自动验证中的正常关闭不再触发启动失败弹窗。
- 不包含破坏性 CLI 变更；显式 `buildr web --port <port>` 与任务预览（Task Preview）的随机端口语义保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-channel-isolation`: Development Launcher 改为固定默认端口，并明确端口占用和启动恢复语义。
- `local-app-browser-verification`: 普通浏览器验证显式禁止平台 GUI、默认浏览器和真实 Development Web 副作用。
- `product-verification-quality`: 将无界面产品验证与显式平台 Launcher 集成验收分层，并约束二者的 GUI 副作用。
- `buildr-package-assets`: self-bootstrap Development Launcher 连续性改为固定端口和运行意图恢复。

## Impact

- 影响 `buildr` Service 的 Development Launcher 构建、正式 Launcher runner、Buildr Web Runtime、release smoke 与验证 registry。
- 影响 Buildr 自举专用连续性脚本及其 focused/integration/contract 测试。
- 不修改 Buildr Web 前端源码，不修改公开 Web API，不改变正式 npm Launcher 默认端口 `4457`。
