# 迁移 Buildr Web 实例生命周期

## 一句话摘要

把默认 Buildr Web 与 Preview 的实例运行策略收敛到窄 Web 模块，同时保留 HTTP 宿主、前端、公开接口和全部外部行为不变。

## 背景与问题

实例 receipt、启动锁、端口、PID、Secret、Launcher handoff、Preview ownership、维护与清理目前位于 `interfaces/local-app/runtime`，启动编排和 Preview CLI DTO 又与 HTTP Server 同处一处，使生命周期 Application、HTTP Host 和 Bootstrap 的责任边界不清。

## 目标 / 非目标

目标是建立扁平的 `web/application`、`web/infrastructure`、`web/interfaces/cli` 与 `web/module.mjs`，让实例生命周期由 Web Application 唯一编排并通过 module contribution 接入 Bootstrap。

本次不迁移 HTTP Router、Controller、Session、安全边界、静态托管和 `web-dist`，不修改 React/Vite 前端，也不改变 Launcher、Task Environment、Workspace 或 SQLite authority。

## 受影响用户或角色

- 使用 `buildr web` 与 Launcher 的用户：行为和输出保持不变。
- 使用 task worktree Preview 的 Agent：实例 owner、resource receipt 和验收 URL 保持不变。
- 后续 Web HTTP Host Child：获得稳定、窄的生命周期调用边界。

## 核心流程

1. CLI Host 从 Web module 取得唯一 command contribution。
2. Web Application 判断复用、handoff 或启动，并编排锁、端口、receipt、server factory 与 maintenance。
3. Web Infrastructure保存Web专属运行状态并执行健康探测和认证退出。
4. Preview继续通过Task Environment公开能力登记、探测、释放和清理动态资源。
5. HTTP Host只处理server、Router、Session、安全与静态托管，后续再由独立Child迁移。

## 关键变化

- 生命周期生产文件迁入扁平 `src/web` 技术层。
- 新增 Web module 与 CLI contributions，删除 Bootstrap 重复 routes。
- HTTP Server 退出 CLI/实例 lifecycle 注册和 scheduled maintenance ownership。
- 更新 imports、发布依赖闭包、verification owner 与架构测试。

## 影响 / 风险 / 兼容性

迁移不改变 schema、端口、输出或资源 ownership。主要风险是 server ready/close 与 maintenance、receipt 清理顺序漂移；通过保留原顺序并运行默认实例、Launcher、Preview ownership、maintenance 和 package tests 控制。

## 验收摘要

- Web commands 只由 Web module 贡献，Bootstrap 不含实例策略。
- 旧 `interfaces/local-app/runtime` 生命周期入口退出且无第二实现。
- 现有 CLI、HTTP、JSON、Launcher、Preview 和 maintenance 回归保持通过。
- `src/web/**` 进入正确 Application Payload 与 Verification owner 闭包。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Web instance lifecycle spec](specs/buildr-web-instance-lifecycle/spec.md)
- [Implementation tasks](tasks.md)
