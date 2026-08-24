# 迁移 Task Retrospective 专业能力

## 一句话摘要

把 Task Retrospective 作为保持行为等价的窄纵向切片迁入 Buildr `task` 模块，并通过唯一 Bootstrap module entry 组装。

## 背景与问题

Task Retrospective 已有稳定的报告、处置状态、Application writer、SQLite Repository、内部 driver 和 Buildr Web 行为，但生产实现仍散落在全局技术层与 Task persistence 子目录。Repository、Application、HTTP 与 internal runner 分别由不同旧入口装配，难以从目录和模块合约直接判断能力 owner，也增加后续 Task 能力并行迁移的共享入口冲突。

## 目标与非目标

目标是将 Task Retrospective Domain、Application、Persistence、Internal/HTTP Interfaces 迁入 `src/task` 对应技术层，通过一个窄 module descriptor 提供能力端口、HTTP contribution 与 bundled runner，并退出旧直接注册入口。

本变更不调整复盘报告、处置状态、CAS、终态规则、公开 CLI/HTTP/JSON、SQLite schema、Task Record 来源关系、前端源码或其他 Task 专业能力。

## 受影响用户或角色

- 使用 `task-retrospective` Skill 和 bundled internal route 的 Agent：调用方式、exit code 与 JSON 结果不变。
- Buildr Web 用户：复盘查看、已处理、无需处理和重新打开行为不变。
- Buildr Service 维护者：可以从 `src/task` 与 `src/task/module.mjs` 识别 Task Retrospective 完整 owner、依赖和 writer 边界。

## 核心流程

Bootstrap 在 Task Record module 之后安装 Task Retrospective module；Retrospective module 私有组装 Repository 与 Application，对外提供共享 Application、只读 Persistence port、HTTP contribution、内部 runner 和带退出条件的兼容端口。HTTP 与 internal workflow Host 只负责公共边界和分发，不产生第二套实现或 writer。

## 关键变化

- Task Retrospective 生产职责进入 `src/task` 的 flat-first 技术层。
- Internal wrapper/runner 合并为一个可导入且可直接执行的 driver 文件。
- Buildr Web GET/PATCH 通过 module HTTP contribution 接入 Host。
- legacy runtime、全局 Task persistence、HTTP Host 与公共 internal router 不再直接注册或依赖旧实现路径。
- Verification owner、架构检查与 package tests 跟随新路径更新。

## 影响、风险与兼容性

主要风险是模块安装顺序、driver 直接执行判断、HTTP 重复匹配和 verification path 漏选；通过显式 dependencies、module/Host contract tests、internal route/package tests 和 owner coverage 控制。变更不包含数据 migration，失败时可整体回滚源码移动与装配修改。

## 验收摘要

- Task Retrospective 生产实现只存在于 `src/task` 对应技术层，旧入口退出。
- Bootstrap 只安装一个 Task Retrospective module，并提供唯一 HTTP contribution 与 bundled runner。
- Task Retrospective Application 仍是唯一 writer，SQLite、CAS、终态和所有外部行为保持等价。
- checkout、Application Payload 与 npm candidate 的 Retrospective journeys 通过既有验证。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-retrospective-module-architecture/spec.md`
- `tasks.md`
- `docs/architecture/service-architecture.md`
- `openspec/knowledge/architecture/technical.md`
