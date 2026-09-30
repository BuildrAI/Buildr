# relaunch-updated-buildr-web

## Why

`buildr update` 更新 npm 包后，仍在运行的旧版本 Buildr Web 实例被 `installation status` 报告为 `ready`，但身份与新安装不一致。所有按"ready 且身份匹配才打开"的入口（DSH 桌面插件按此 fail closed）会被永久挡住，报"不属于该安装"，而本可完成重启的 launcher handoff 永远无法被触发——按钮失效直到用户手动重启应用。另外 macOS Launcher 默认安装目标是 `~/Applications`，不符合平台惯例，应为 `/Applications`。现在修复：该缺陷已在真实升级中复现，且随每次 npm 更新必然复发。

## What Changes

- `installation status` 实例分类：released 实例健康但产品身份与当前安装身份不一致时，区分"同一安装槽位的旧版本"（报告为可重启的 `stale`，入口据此调起 Launcher 完成 handoff 重启）与"无法证明同槽位/外来实例"（保持 fail closed，不报可重启）。
- `buildr update` 成功后的 `nextActions` 与 Buildr Skill 更新指引：当同槽位旧实例仍在运行时，指导智能体（Agent）通过已安装 Launcher 重启完成实例切换；从正在运行的实例内部发起的更新不做自我终止。
- macOS `buildr web launcher install` 默认目标改为 `/Applications/Buildr Web.app`；写入权限不足时返回可解释错误并指引 `--target`，不静默退回 `~/Applications`；`status`/`repair`/`uninstall` 对遗留 `~/Applications` 安装如实呈现并继续可操作。
- 无破坏性变更：`instances.*.status` 取值集合不变（`stale` 已被消费方接受），对外只改变"旧版本同槽位实例"的分类语义；插件无需改动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `buildr-web-workspace-application`: `installation status` 对运行中实例的版本一致性分类，以及 macOS Launcher 默认安装目标与旧位置处理。
- `buildr-cli-self-update`: `buildr update` 成功后的 nextActions 需覆盖"同槽位旧实例仍在运行"的重启指引。
- `product-agent-skills`: Buildr Skill 指导 Agent 在 npm 更新后处理旧版本实例的方式。
- `dsh-desktop-integration`: 明确插件对 `stale`（同槽位旧版本实例）走 launcher 启动路径、由 Buildr handoff 完成重启的语义。

## Impact

- 代码：`services/buildr/src/modules/installation/application/product-installation-status.ts`（实例分类）、`infrastructure/npm-launcher.ts`（默认目标、status/repair 目标解析）、`application/cli-update.ts`（nextActions）、`resources/runtime/skills/buildr/`（Skill 指引）。
- 公开契约：`buildr.installation-status/v1` 的 `instances.*.status`/`reason` 语义收紧；schema 版本不变。
- 影响入口：DSH 插件、`buildr web launcher`、Doctor 实例段展示——旧版本同槽位实例从"ready 但身份不匹配"变为"stale 可重启"。
- 测试：安装状态单测、launcher 目标解析测试、插件消费语义保持不变。
