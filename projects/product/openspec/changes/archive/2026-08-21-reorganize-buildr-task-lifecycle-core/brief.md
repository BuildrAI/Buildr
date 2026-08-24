# 迁移 Buildr Task 生命周期核心

## 一句话摘要

把八项紧密协作的 Task 生命周期核心能力迁入 Buildr `task` 模块，同时保持各专业 writer、公开接口和持久化行为不变。

## 背景与问题

Task Record、Review 和 Retrospective 已有明确的模块入口，但 Environment、Development、Verification、Execution Record、Planning Identity、Entry Snapshot、Overview 与 Parent Coordination 仍分散在全局技术层，由 legacy runtime、全局 persistence 聚合和 Host 直接组装。它们共享大量 Bootstrap、CLI、HTTP 和验证入口，继续拆成过窄任务会重复修改同一组文件并增加并行冲突。

## 目标 / 非目标

目标是在 `src/task` 的扁平技术层中收敛这八项能力，通过多个独立 descriptor 保持各专业 Application/Repository authority，并从旧直接注册入口退出。

本次不迁移 Task Finish、Terminal Delivery、Delivery Carrier、Activation、Cleanup、Finish recovery 或 HTTP 公共宿主，不修改 Task Record、Review、Retrospective 的已迁移边界，也不改变任何公开行为或数据语义。

## 受影响用户或角色

- 使用 Task Environment、Verification、Parent Coordination 和 `task next` 的 Agent：CLI、internal route 与 JSON 结果保持不变。
- 使用 Buildr Web Task 详情的用户：Overview、Development、Evidence、Environment 和 Parent 协调展示保持不变。
- Buildr Service 维护者：可以从 `src/task` 与 `src/task/module.mjs` 识别核心能力的真实 owner、依赖和剩余 Finish 边界。

## 核心流程

Bootstrap 先安装 Task Record，再按依赖安装 Environment、Execution Record、Review/Retrospective、Verification、Planning Identity、Development、Parent Coordination、Overview 与 Entry Snapshot。每个 descriptor 私有组装所属 Repository/Application，并通过窄 ports 和 contributions 服务 CLI、HTTP、internal workflow 及仍未迁移的 Finish consumer。

## 关键变化

- 八项核心能力的 Domain、Application、Persistence 与适用 Interfaces 进入 `src/task` 扁平技术层。
- CLI、HTTP 和 internal workflow 从 Task module contributions/ports 接入。
- legacy runtime、旧 persistence 聚合和 Host 退出核心能力的直接注册或 import。
- Application Payload、Verification owner、架构门禁、测试和服务架构文档跟随真实路径更新。

## 影响 / 风险 / 兼容性

主要风险是模块依赖顺序、重复 route、Finish consumer 兼容和 Repository 相对路径漂移；通过显式 requires/provides、contribution 唯一性、有限 compatibility projection 及原有 failure/rollback journeys 控制。没有 SQLite migration、公开协议或业务状态变化。

## 验收摘要

- 八项核心能力只从 `src/task` 的对应技术层和单一模块入口提供。
- 每个 Receipt/Result/Execution Record 仍由原专业 Application 与唯一 Repository writer 维护。
- 旧直接 registration、重复 route 和能力 persistence 子目录退出。
- checkout、Application Payload 与 npm candidate 的相关 Task journeys 保持等价。
- 服务架构/current knowledge 明确记录核心已迁移，而 Finish 集群仍为后续范围。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task lifecycle core module architecture spec](specs/task-lifecycle-core-module-architecture/spec.md)
- [Implementation tasks](tasks.md)
- `docs/architecture/service-architecture.md`
- `openspec/knowledge/architecture/technical.md`
