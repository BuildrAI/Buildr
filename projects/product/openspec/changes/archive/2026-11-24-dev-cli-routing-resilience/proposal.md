## Why

目前机器全局默认 `buildr` 命令由 npm 安装持有，其开发版来源发现仅依赖桌面启动器路径（`/Applications/Buildr Development Dev.app` 或旧名 `Buildr Web Dev.app`），而且开发版自身应用拉起的智能体会话也沿用全局 `PATH` 中的 npm `buildr`。当开发启动器随版本更新改名并清理旧入口、而全局 npm 包尚未同步升级时，不仅外部命令行工具（终端、GrokBot 等）的路由断裂，连开发版应用内部的智能体对话也会连带无法执行 `buildr`；同时开发启动器安装时缺乏对本机旧版全局 npm CLI 路由兼容性的提前预警。

需要按[任务说明](@task/dev-cli-routing-resilience)落地产品级根治方案，消除桌面展示名变化与滞后 npm 包对开发版工作流的影响，同时保持正式 npm 安装与外部命令行的现有所有权边界。

## What Changes

- **稳定开发来源登记与路由优先发现**：开发版启动器安装时在开发版共享数据目录原子写入与桌面展示名解耦的 `development-source.json`（`buildr.development-source/v1`）；全局 `workspace-cli-routing` 与安装状态发现优先读取该登记，文件损坏或无效时严格失败关闭（fail closed），仅在文件不存在时兼容回退桌面启动器登记。
- **开发版 Harness 会话直连本机开发版 CLI**：当 Harness 运行在 `development` 配置域且当前数据域存在有效或可核验的开发来源登记时，执行器存储为智能体子进程私有工具链目录生成会话级 `buildr` 入口并前置到会话 `PATH`；该入口对开发版归属工作空间及未登记目录直接运行本机已验证开发源码及绑定 Node，对全局 npm 安装管理命令和独占归属 `released` 工作空间剥离自身目录后透明委派下游全局 `buildr`。`released` 配置域与开发启动器自有私有 `PATH` 保持不变。
- **开发启动器安装与状态检查的旧版全局 CLI 兼容预警**：开发启动器安装和状态检查只读核对配对发布版数据目录的已安装全局 npm 包路由兼容能力，在发现旧版不兼容路由器时输出非阻断结构化兼容状态与更新提醒。

不涉及破坏性接口或数据格式变更；未安装开发来源或位于 `released` 配置域的行为保持不变。

## Capabilities

### New Capabilities

### Modified Capabilities
- `workspace-cli-routing`: 调整开发来源发现顺序，优先读取目标开发数据目录的稳定 `development-source.json`，并在损坏或身份无效时明确失败关闭而不静默回退桌面启动器。
- `buildr-web-channel-isolation`: 要求开发启动器安装/卸载同步原子维护与清理归属匹配的 `development-source.json`，并在安装与状态检查时只读检测旧版全局 npm CLI 路由兼容性以提供非阻断预警。
- `harness-host-integration`: 要求 `development` 配置域的 Harness 执行器环境提供会话级直连开发 CLI 入口，保证开发版智能体会话不依赖全局 npm 安装且维持既有安装边界与防递归分发。

## Impact

- `services/buildr`：安装契约（`web-profile.ts`）、工作空间 CLI 路由（`workspace-cli-routing.ts`）、安装状态发现（`product-installation-status.ts`）、开发启动器生命周期管理（`tools/build/launcher/manage.ts`）及 `docs/cli-architecture.md`。
- `services/buildr-harness`：执行契约与参数传递（`contracts.ts`、`process/server.ts`、`application/agent-service.ts`、`application/connection-application.ts`、`application/executor-storage.ts`），新增会话 CLI 环境准备（`storage/development-cli-environment.ts`）与开发会话路由（`process/development-cli-shim.ts`）。
- 相关静态检查、单元测试、集成测试与启动器端到端测试；`knowledge/` 现有长期说明未受过时实现影响，无需本次额外改写。
