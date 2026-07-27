# 跨任务验证资源协调

一句话摘要：Project 明确声明验证资源如何隔离或协调，Buildr 让多个 task environment 的有限资源按容量排队，并只清理当前 run 拥有的资源。

## 背景与问题

现有 scheduler 只限制单个验证进程内部的并发。多个任务同时验证时，浏览器、重型 Workspace fixture、Docker 或共享测试数据仍可能冲突；Project 声明也无法表达资源究竟应独立、命名隔离、排队还是外部授权。

## 目标与非目标

目标是建立可声明、可诊断、跨进程且有精确 ownership 的验证资源协调。非目标是调度 Agent 任务、创建外部租户、管理业务数据或用全局锁串行全部验证。

## 受影响用户或角色

- 同一 Workspace 中并发开发和验证多个任务的 Agent。
- 维护 Project 验证政策、测试环境与共享资源边界的团队。

## 核心流程

Project 登记资源与策略，能力引用资源；provider 在执行前解析 task/run identity：独立资源直接运行，命名资源注入 namespace，容量资源取得共享 slot，外部资源核对授权。执行结束后只释放当前 token 对应的 claim。

## 关键变化

- `verification.yml` 新增资源目录与 capability claims。
- 新增四种策略：`isolated`、`namespaced`、`coordinated`、`external`。
- Product verification runner 使用 Git common-dir 中的临时 slot leases 跨 task worktree 协调。
- timing evidence 区分 DAG 排队与跨任务资源等待。

## 影响、风险与兼容性

字段均为可选，旧 Project 零迁移。租约只存在于本机临时 Git metadata；崩溃通过 expiry 恢复。外部资源仍需显式授权且不会自动清理。

## 验收摘要

- 两个并发进程争用容量 1 时严格串行。
- 不同资源保持并行，命名 namespace 不相同。
- 失败、异常和过期租约可安全释放或恢复。
- ownership mismatch 不会删除其他任务资源。
- 旧 `verification.yml` 继续通过诊断。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/project-test-capabilities/spec.md`
- `specs/task-verification/spec.md`
- `tasks.md`
