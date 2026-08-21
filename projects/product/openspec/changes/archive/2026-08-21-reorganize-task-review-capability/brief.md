# 迁移 Task Review 专业能力

## 一句话摘要

把 Task Review 作为保持行为等价的窄纵向切片迁入 Buildr `task` 模块，并通过唯一 Bootstrap module entry 组装。

## 背景与问题

Task Review 已有稳定的 Result、Application writer、SQLite Repository、CLI 和 Web prompt 行为，但生产实现仍散落在全局技术层，Repository、Application 与接口分别由 legacy runtime、全局 persistence 聚合及 Host 直接装配。这样难以从目录和模块合约直接判断能力 owner，也增加后续 Task 能力并行迁移时的共享入口冲突。

## 目标与非目标

目标是将 Task Review Domain、Application、Persistence、CLI 与直接 HTTP adapter 迁入 `src/task` 对应技术层，通过一个窄 module descriptor 提供能力端口和 contributions，并退出旧直接注册入口。

本变更不调整 Task Review 业务规则、公开 CLI/HTTP/JSON、SQLite schema、Planning/Completion applicability、Task Development/Terminal Delivery、Retrospective、Verification、Web Runtime 或前端。

## 受影响用户或角色

- 使用 `buildr task review` 的 Agent 和专业 Skill：命令与 JSON 结果不变。
- Buildr Web：Task Review prompt 与只读展示行为不变。
- Buildr Service 维护者：可以从 `src/task` 和 `src/task/module.mjs` 识别 Task Review 完整 owner 与依赖。

## 核心流程

Bootstrap 先安装 Task Record module，再安装 Task Review module；Review module 私有组装 Repository 与 Application，对外提供共享 Application、只读 persistence port、CLI/HTTP contributions 和带退出条件的兼容端口。未迁移 consumer 暂时通过同一实现的兼容投射调用，不产生双实现或双 writer。

## 关键变化

- Task Review 五类生产职责进入 `src/task` 的 flat-first 技术层。
- CLI inspect/record 与 Web prompt 通过 module contributions 接入 Host。
- legacy runtime、全局 Task persistence 聚合及 Host 不再直接注册或 import Task Review 内部实现。
- Verification owner、架构检查与相关测试跟随新路径更新。

## 影响、风险与兼容性

主要风险是模块安装顺序、旧 consumer 兼容投射和 verification path 漏选；通过显式 dependency、module snapshot/Host boundary tests 和 owner coverage 审计控制。变更不包含数据 migration，失败时可整体回滚源码移动与装配修改。

## 验收摘要

- Task Review 生产实现只存在于 `src/task` 对应技术层，旧入口退出。
- Bootstrap 只安装一个 Task Review module，并提供唯一 CLI/HTTP contributions。
- Task Review Application 仍是唯一 writer，SQLite 与所有外部行为保持等价。
- checkout 与 Application Payload/npm candidate 的 Task Review journeys 通过既有验证。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-review-module-architecture/spec.md`
- `tasks.md`
- `docs/architecture/service-architecture.md`
- `openspec/knowledge/architecture/technical.md`
