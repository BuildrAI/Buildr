# 迁移 Project Daily Progress 并收敛无效末级目录

## 一句话摘要

把 Project Daily Progress 完整迁入 Workspace 模块，并移除 Task Record 三个只有单文件的 `record/` 目录，保持全部公开行为和 writer authority 不变。

## 背景与问题

Daily Progress 仍散落在全局技术层并由 Bootstrap、CLI registry 和 HTTP Host 直接接线；Task Record 虽已迁入 Task 模块，但 Domain、Application、Persistence 各自多套一层没有协作边界的目录。这两处是父架构任务的明确遗留。

## 目标 / 非目标

目标是让 Daily Progress 的 Domain、Application、YAML Repository、CLI/HTTP Adapter 和模块组装全部归入 `src/workspace/`，同时让 Task Record 文件直接位于各自技术层。

本次不改变 CLI、HTTP、JSON、YAML/SQLite schema、Task 引用、事务或原子性；不修改前端、Session、安全边界或正在独立迁移的 Task Delivery/Finish。

## 受影响用户或角色

- Agent 继续使用相同的 `project daily-progress record|inspect|list` 命令和 JSON。
- Buildr Web 继续通过相同 GET endpoint 只读展示每日演进。
- Service 维护者从 Workspace/Task 模块即可找到唯一实现和组装入口。

## 核心流程

Bootstrap 安装 Workspace module 时注册 Daily Progress YAML Repository 与 Application，并收集其 CLI/HTTP contributions；Task Record 随后安装，Daily Progress 在实际调用时通过同一 runtime compatibility port 读取 Task，不建立第二套 store 或 writer。

## 关键变化

- Daily Progress 四层实现和 Adapter 迁入 `src/workspace/`。
- Workspace module 提供命名 Daily Progress Application capability 与 CLI/HTTP contributions。
- legacy runtime、公共 CLI registry 和 HTTP Host 退出 Daily Progress 业务接线。
- Task Record 的 `domain/record`、`application/record`、`persistence/record` 被扁平化。
- 架构与 verification owner 对新路径和无效末级目录执行门禁。

## 影响 / 风险 / 兼容性

风险集中在 import、命令 catalog 和 HTTP route 顺序，使用旧路径扫描、架构 verifier 及 CLI/HTTP 回归覆盖。没有数据 migration、破坏性变更或公开契约变化。

## 验收摘要

- Daily Progress 只存在于 Workspace module 的对应技术层并由单一 module entry 组装。
- Task Record 三个无效 `record/` 目录不再存在。
- 协议分类目录保留；在途 Finish 目录不由本 Change 修改。
- 公开命令、HTTP、JSON、YAML 与 Task writer/read authority 回归等价。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Workspace Daily Progress module architecture spec](specs/workspace-daily-progress-module-architecture/spec.md)
- [Product source layout delta](specs/product-source-layout/spec.md)
- [Implementation tasks](tasks.md)
- `docs/architecture/service-architecture.md`
- `services/buildr/docs/cli-architecture.md`
- `openspec/knowledge/architecture/technical.md`
