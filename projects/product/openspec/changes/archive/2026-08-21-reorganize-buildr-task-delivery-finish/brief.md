# 迁移 Buildr Task Delivery 与 Finish

## 一句话摘要

把 Task Finish、Terminal Delivery 及完整交付副作用闭环迁入 Buildr `task` 模块，同时保持远端交付、恢复、激活、清理与 writer authority 不变。

## 背景与问题

Task 生命周期核心已经通过 `src/task/module.mjs` 形成明确模块边界，但 Finish Application、Terminal Delivery、CLI/internal adapters 和 Finish Repository 仍分散在全局技术层及单文件子目录，并由 legacy runtime 直接注册。它们共同承担 Delivery Carrier、Adaptation、Reconciliation、Activation、Cleanup、Maintenance、diagnostics、execution evidence、retained/bootstrap recovery 与 Git delivery contribution，必须作为一个高副作用闭环原子迁移。

## 目标 / 非目标

目标是把 Finish 集群迁入 `src/task` 的明确技术层，由独立 Finish/Terminal Delivery descriptors 唯一组装，并退出旧全局 registration、route owner和动态路径。

本次不改变 Development、Verification、Completion Review、Candidate 或风险接受 authority，不修改 Git delivery、远端证明、恢复 token、Activation、cleanup、maintenance、SQLite 或公开协议，也不迁移 Web HTTP Host 或 System Doctor。

## 受影响用户或角色

- 使用 `task finish`、`task delivery inspect` 和正式收尾流程的 Agent：命令、JSON、诊断、恢复和副作用保持不变。
- 使用 Buildr Web Task 详情的用户：Terminal Delivery 状态和关联证据保持不变。
- Buildr Service 维护者：可以从 `src/task` 与 `src/task/module.mjs` 识别 Finish/Delivery 的真实 owner、依赖和高风险恢复边界。

## 核心流程

Bootstrap 在 Task 生命周期核心之后安装 Task Finish descriptor，再安装依赖 Finish read model 的 Terminal Delivery descriptor。Finish 继续只消费 current Development handoff，执行 carrier preparation、target transition/readback、activation与cleanup；Terminal Delivery 只投影已经保存的 Task、Development、Review、Verification 与 Finish terminal association。

## 关键变化

- Finish 私有 Application 协作者进入 `src/task/application/finish/`；Terminal Delivery、Finish Repository 和 CLI/internal adapters 进入 `src/task` 对应技术层。
- Task module提供Finish/Terminal Delivery descriptors、CLI/internal contributions 与受限 ports。
- legacy runtime、CLI registry、lightweight inspect、Application Payload、Doctor、self-bootstrap 和 tests 原子切换到新入口。
- 服务架构文档和 current knowledge 记录 Finish 集群已迁移，以及 Web HTTP/System Doctor/最终 legacy convergence 的剩余边界。

## 影响 / 风险 / 兼容性

主要风险是动态 recovery path、轻量 inspect、capsule source、remote/carrier ownership 与测试 fixture 遗漏；通过完整旧路径 inventory、descriptor唯一性、installed-layout/Application Payload验证及现有 Finish/self-bootstrap journeys 控制。没有 SQLite migration、公开协议或交付语义变化。

## 验收摘要

- Finish/Terminal Delivery 生产实现只从 `src/task` 对应技术层提供。
- Bootstrap 与 CLI Host 只通过 Task module安装和分发，没有旧全局注册、重复 route或兼容转发文件。
- run/resume/reconcile/inspect、Terminal Delivery、carrier/adaptation、remote readback、activation、cleanup、maintenance、diagnostics 和 recovery 保持等价。
- checkout、Application Payload 与 npm candidate 的入口和验证 owner覆盖新路径。
- 服务架构/current knowledge 与实现保持一致，旧路径与 migration清单无漂移。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Delivery and Finish module architecture spec](specs/task-delivery-finish-module-architecture/spec.md)
- [Implementation tasks](tasks.md)
- `docs/architecture/service-architecture.md`
- `openspec/knowledge/architecture/technical.md`
- `openspec/knowledge/services/buildr.md`
