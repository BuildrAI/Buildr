# 需求说明：更新后让旧版 Buildr Web 实例可重启，Launcher 默认安装到 /Applications

## 背景问题

本机实际复现：`buildr update`（npm lifecycle）把 `@buildr-ai/buildr` 从 0.1.0-rc.37 更新到 rc.38，但旧的 Buildr Web 实例仍在运行。`installation status --json` 把该旧实例报告为 `instances.released.status: ready`，DSH 插件按"ready 且身份匹配才打开"的规则拒绝，报"正在运行的 Buildr 不属于该安装，未打开另一份实例"，正式版按钮不可用。此时 launcher handoff（`handoff-launcher`）本来能识别"同一安装槽位的旧版本"并完成优雅重启，但所有入口在到达 launcher 之前就被身份比对截断。直到用户手动重装/重启应用，入口才恢复。

同时，macOS 上 `buildr web launcher install` 默认目标是 `~/Applications/Buildr Web.app`；平台惯例是 `/Applications`，本次用户明确要求改默认位置。

## 目标与范围

- `installation status` 对"同一安装槽位、版本落后"的运行中实例报告为可重启状态而不是 `ready` 身份不匹配，使 DSH 插件、Launcher 等所有入口能触发已有 handoff 完成重启；无法证明同槽位的外来实例保持 fail closed。
- Buildr Skill 指导智能体（Agent）：npm 安装更新后如旧版本实例仍在运行，通过已安装 Launcher 完成实例切换；更新结果对该场景给出可执行的 nextActions。
- macOS 上 `web launcher install` 默认目标改为 `/Applications/Buildr Web.app`；写入权限不足时返回可解释错误和 `--target` 指引，不静默退回 `~/Applications`；已装在旧位置的 Launcher 由 status/repair 正确呈现真实目标。

## 非目标

- 不在 `buildr update` 中无差别强杀正在运行的实例；从正在运行的实例内部发起的更新不自我终止，重启动作交给入口或用户明确触发。
- 不改变 development 渠道的实例身份规则与 handoff 语义。
- 不修改 DSH 插件的身份匹配逻辑（修复完全落在 Buildr 端的状态报告与指引）。

## 验收要点

- 同槽位旧版本实例在 `installation status` 中不再报 `ready`，DSH 插件点击可经 launcher handoff 恢复打开。
- 外来实例（槽位无法证明或 `profile-conflict`）仍被拒开。
- `buildr web launcher install` 默认写入 `/Applications`；权限不足时诊断明确且不写入 `~/Applications`。
- Buildr Skill 更新指引覆盖"旧实例仍在运行"场景。
