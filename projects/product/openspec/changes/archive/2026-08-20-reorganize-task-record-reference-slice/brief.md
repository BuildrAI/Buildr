# Task Record 纵向参考切片

## 一句话摘要

Buildr 将 Task Record 迁移为 `src/task/` 下首个模块优先纵向切片，在不改变任何公开行为和数据 authority 的前提下，为后续 Service 架构重构建立可验证范式。

## 背景与问题

Task Record 的领域规则、应用用例、SQLite 映射、CLI/HTTP 入口和运行时注册目前分散在全局技术层。已有实现具备技术分层，但源码所有权没有表达 Task 模块边界，也缺少一个经过完整验证、可供后续能力迁移复用的参考切片。

## 目标与非目标

目标是建立 Task Record 的 Domain、Application、Persistence、Interfaces 和模块注册入口，迁移全部调用方、测试与 Verification selector，并保持唯一实现和唯一 writer。非目标是不迁移其他 Task 能力，不建立全局模块 descriptor，不重构 CLI/HTTP Host、SQLite 平台、数据模型或前端。

## 受影响用户与角色

- Buildr 维护者：获得首个可复制的模块优先目录和迁移验证范式。
- Agent：继续使用完全相同的 Task Record CLI、HTTP/JSON 和 Task lifecycle 语义。
- 后续 Child Task：以本切片的依赖规则、旧路径清理和验证台账作为迁移输入。

## 核心流程

1. `src/task/module.mjs` 在全局 composition root 中注册 Task Record repository 与 application。
2. CLI registry 和 Local App HTTP Host 把请求交给模块内接口适配器。
3. 模块 application 继续组合 Task Record domain 与 runtime persistence port。
4. 模块 persistence 继续通过统一 Workspace SQLite store 执行原有事务和 Row/对象映射。
5. 架构与 Verification registry 按新路径检查边界并选择受影响验证。

## 关键变化

- Task Record 实现从全局技术层迁移到 `src/task/` 内部技术层。
- 全局 composition root 不再分别知道 Task Record repository/application 的内部路径。
- Task Record CLI 与 list/detail/update/complete/abandon HTTP Adapter 归属 Task 模块。
- 旧实现路径直接删除，不保留 re-export 或兼容 facade。

## 影响、风险与兼容性

变更影响内部 import graph、composition、HTTP 路由组织、测试和 Verification selector。公开 CLI/HTTP/JSON、SQLite schema、事务、错误映射、Parent/Child 与复盘来源关系均保持兼容；主要风险是 import 遗漏与 HTTP 边界漂移，由旧路径扫描、架构检查和 Task Record unit/integration/system 验证控制。

## 验收摘要

- Task Record 六类实现只存在于 `src/task/` 对应技术层。
- composition root 只通过 `src/task/module.mjs` 注册该切片。
- CLI、HTTP、Doctor 和其他 Task 能力继续通过原契约工作。
- 旧路径和 facade 为零，affected verification 能命中新路径。
- OpenSpec strict validation、架构检查和 Task Record 代表验证通过。

## 实施结果

Task Record Domain/Application/Persistence/CLI 已直接迁移，Local App 的 list/detail/update/complete/abandon 路由由模块内 HTTP Adapter 处理；Host 继续拥有 session、origin、body 上限、JSON response 和统一错误边界。旧实现路径扫描为零，architecture verifier 已按 `task/domain|application|persistence|interfaces` 的真实职责检查 import graph，`src/task/**` 会选择 `cli-architecture` 与 `system-task-lifecycle`。实现期直接检查已覆盖 runtime composition、42 个 unit/contract/integration 用例、Task lifecycle 6 个系统文件和 Local App HTTP 2 个系统文件；最终 affected verification 以完成全部知识收敛后的树重新执行。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/product-source-layout/spec.md)
- [Tasks](tasks.md)
- [长期架构方向](../../../../docs/architecture/service-architecture.md)
