# Buildr Web 当前源资产命名全面收敛

## 一句话摘要

将当前源资产的用户可见命名统一为 Buildr Web 分层术语，同时保留已发布 wire、环境、持久化与历史 publication 兼容身份。

## 背景与问题

Buildr Web 已是当前本机浏览器产品的定位，但当前代码、测试、验证、Skill、规则、文档和 canonical OpenSpec 仍混用 Buildr Web、local-app 与 Buildr Web。部分旧标识又承担跨进程、持久化或历史数据兼容责任，不能直接替换。

## 目标与非目标

目标是完成当前非归档源资产的公开命名收敛，并形成兼容标识清单和验证证据。非目标是修改历史 archive、重构 UI、迁移数据库或破坏既有 JSON/protocol/environment identity。

## 受影响用户与角色

- 使用 CLI、npm Launcher 或浏览器的 Buildr 用户。
- 维护 Buildr Runtime、Buildr Web Frontend Service、验证 registry 和 Skills 的开发者/Agent。

## 核心流程

公开命名扫描与术语决策 → Runtime/Frontend/验证/文档实现 → 兼容 reader/writer 与 ownership 测试 → 非归档残留扫描 → Buildr Web 与 Browser 验证。

## 关键变化

- 公开术语统一为 Buildr Web、Buildr Web Runtime、Buildr Web Frontend Service、Buildr Web Launcher、Buildr Web Preview。
- `buildr.local-app-*`、`local-app-preview`、`BUILDR_LOCAL_APP_PREVIEW`、SQLite/persistent identity 保留；publication 新写入 `buildr-web`，旧 `local-app` 兼容读取。
- 开发 Bundle Identifier 迁移并保留旧 identity 的 ownership-aware 识别。

## 影响、风险与兼容性

影响 Buildr Runtime/CLI、Frontend、Launcher、验证、Skills、当前 knowledge 和 canonical specs。主要风险是误改稳定 identity、误清理其他进程、遗漏当前引用；通过 explicit allowlist、旧值 reader、ownership 检查和 archive invariants 缓解。

## 验收摘要

严格 OpenSpec 校验、affected tests、web-dist、Browser smoke 通过；archive 无差异；非归档旧称仅剩兼容清单允许项，并有逐项原因。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
