# Task Development 调用契约可发现性

## 一句话摘要

让 Agent 在执行 Task Development 内部 driver 前，直接取得与 Application 顶层字段校验同源的 action 帮助、输入 schema 和最小示例。

## 背景与问题

当前 driver 只显示 action 列表与公共参数。`begin`、`planning`、`policy` 等 action 的结构化输入只能通过阅读实现和测试推断，本次复盘已经出现一次输入层级错误和由此产生的无效调用。

## 目标与非目标

目标是为当前 Task Development driver 提供 action 级 `--help`、`--schema` 和 `--example`，并让 Application 顶层字段白名单消费同一 contract。非目标是建立全局命令 schema 框架、增加公共 Development CLI、改变生命周期语义或提供 OpenSpec 全量骨架能力。

## 受影响用户或角色

- 调用 Task Development Skill 和内部 driver 的 Agent。
- 维护 Task Development Application、driver 与契约测试的 Buildr 开发者。

## 核心流程

Agent 先请求全局帮助选择 action，再按 action 获取 closed input schema 或最小示例，结合 current Task facts 组装 payload，最后执行原有 action。发现请求不需要 Task/Workspace，不 compose runtime，也不产生持久化 effect。

## 关键变化

- 新增 action contract 定义，集中保存用途、输入 schema 与示例。
- Driver 新增全局/action 帮助、schema 和示例发现模式。
- Application 顶层字段白名单改为读取同一 contract。
- 普通 action、profiling、Receipt 与错误语义保持兼容。

## 影响、风险与兼容性

变更仅涉及内部 driver 与 Task Development Application 输入边界，不增加依赖或数据库迁移。静态 schema 不证明运行态业务合法性；Task、Environment、Change 和 identity 等约束仍由 Application fail closed。现有调用不使用发现选项时行为不变。

## 验收摘要

- 所有现有 action 均可在无 Task/Workspace 条件下读取帮助、schema 和示例。
- Schema 为 closed object，并与 Application 顶层字段白名单同源。
- 发现路径不 compose runtime、不访问 Workspace、不写 Receipt。
- 原有普通 action、错误 envelope 和 profiling 测试继续通过。

## 技术 Artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Development delta spec](specs/task-development/spec.md)
- [Tasks](tasks.md)
