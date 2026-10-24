## Why

用户当前必须分别理解安装、同步与运行时投射，旧工作空间可能长期落后于安装版本。一次添加及一次更新应直接交付可用目录，并诚实展示局部失败。

## What Changes

- 官方资源集中到 `~/.buildr/resources/`，保留完整技能附件，不创建独立 `templates/` 或官方规则目录。
- 工作空间保留逻辑引用、选用配置及组织自有内容；已有未修改官方副本安全迁移，用户修改保留。
- 添加目录后直接初始化、登记、准备入口与检查，失败可重试。
- 网页确认一次更新后自动下载、安装、维护已有启动器、交接、更新全部本来源已登记目录；持久结果与局部重试。
- 诊断核对采用身份、内容及生成结果。本轮不增加智能体发起更新。
- **BREAKING**：官方技能源不再要求每空间保存一份；已有命令及组织自有源继续兼容。

## Capabilities

### New Capabilities

- `shared-package-resources`: 固定共享目录的完整替换、采用及诊断。

### Modified Capabilities

- `workspace-first-runtime-projection`: 来源分离并保留空间装配。
- `buildr-web-workspace-application`: 目录直接初始化与恢复。
- `web-update-flow`: 一次确认及全部登记目录更新与重试。

## Impact

涉及安装、工作空间、智能体资产、诊断模块及前端对应功能；复用当前目录选择、安装归属、更新记录及所有权回执。任务：[任务说明](@task/simplify-workspace-lifecycle)。
