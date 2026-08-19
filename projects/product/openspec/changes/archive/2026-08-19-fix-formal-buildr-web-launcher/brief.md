# 修复正式版 Buildr Web Launcher 启动与端口策略

一句话摘要：让正式 npm Launcher 默认首选 `4457`、端口冲突时安全回退随机端口，并修复 macOS 重复打开失败。

## 背景与问题

正式 Launcher 当前不保存端口策略，每次全新启动使用随机端口；macOS wrapper 又以前台 shell 持有 Web 进程，导致实例运行后再次点击 `.app` 被 LaunchServices 以 `-600` 拒绝。服务本身健康，但图形入口不可稳定重开。

## 目标与非目标

- 目标：正式 Launcher 默认首选 `4457`，支持指定端口或 `0` 随机端口，首选端口占用时只回退一次随机端口。
- 目标：首次打开和重复打开都能启动或复用 matching released 实例。
- 目标：保持 npm installation binding、released/development Data Root 和单实例边界。
- 非目标：不发布 npm、不覆盖当前用户正式 Launcher、不改变 development profile、不处理签名公证或开发版页面标识。

## 受影响用户与核心流程

使用 macOS 或 Windows 正式 npm Launcher 的本机用户受影响。用户安装或 repair Launcher 后点击入口；Launcher 校验同一 npm installation，启动或复用 released Web。默认端口可用时访问 `127.0.0.1:4457`，被占用时启动随机 loopback 端口并打开实际 URL。

## 关键变化

- npm Launcher binding 保存 closed 端口策略并支持旧 binding repair。
- released Launcher 启动在同一 start lock 内执行一次有界端口回退。
- macOS App executable 变为短生命周期入口，把一次性运行器提交给用户 launchd；ownership 派生的 bundle identifier 允许正式 App 与隔离候选并存，运行器保留日志、失败提示并自清理临时 job。
- 普通 `buildr web --port`、Development Launcher 和 Preview 保持既有语义。

## 影响、风险与兼容性

默认端口是首选而非永久保证；端口被占用时 URL 仍可能变化。旧健康 released 实例优先复用，不为迁移端口自动停止。旧 v1 binding 只通过同 npm installation 的 status/repair 路径迁移，未知 Launcher 继续 fail closed。

## 验收摘要

- 新正式 Launcher 在端口可用时监听 `4457`。
- 端口占用时回退随机端口且不接管未知进程。
- macOS 首次与重复打开都成功，不再返回 `-600`。
- 未发布本地 npm candidate 可在隔离 target 完成真实 Launcher 验证。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta Spec](specs/buildr-web-channel-isolation/spec.md)
- [Tasks](tasks.md)
