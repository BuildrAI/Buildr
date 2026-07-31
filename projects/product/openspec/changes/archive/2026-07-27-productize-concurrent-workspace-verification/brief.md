# 将并发验证产品化为通用 Workspace 能力

## 一句话摘要

让任意 Buildr Workspace 都能通过正式 CLI 在隔离任务环境中并发开发、并发验证和安全清理，同时恢复 Buildr 自身当前失败的 Candidate 组合验收。

## 背景与问题

Buildr 已实现 task environment、多仓 worktree、receipt-bound CLI、隔离 preview、验证 DAG、跨任务资源租约和双任务组合验收，但通用验证执行器仍属于产品测试代码，已安装 Buildr 无法把这些能力直接用于普通 Project。与此同时，Candidate fixture 没有跟上 Task Finish 新增的 `evidenceIdentity` 契约，preview stop 与 worktree cleanup 也缺少完整的 owner/process 门禁。

## 目标与非目标

目标是提供可安装的 `buildr verification run`，按 Project `verification.yml` 执行 affected/Candidate DAG，支持同 run 并行和跨 task 资源协调，生成候选身份绑定的可信 evidence；同时补齐 preview/process 所有权清理闭环并恢复 Candidate gate。

本变更不调度 Agent 或创建任务，不引入远程分布式执行平台，也不把 Buildr Product 私有测试 registry 固化为其他项目默认政策。

## 受影响用户或角色

- 在同一 Workspace 中并行实现多个任务的开发 Agent。
- 维护 Project 验证声明和发布门禁的项目维护者。
- 通过 Task Finish 消费正式验证 evidence 的交付流程。

## 核心流程

1. Project 在 `verification.yml` 声明验证能力、依赖、阶段和资源策略。
2. 调用方在普通 checkout 或 canonical task environment 中运行 `buildr verification run`。
3. Buildr 核对 Project/task/candidate context，构造 DAG，并发执行可兼容能力，对共享容量取得跨任务 lease。
4. Buildr 返回包含真实 wall-clock、资源事件、终态和 `evidenceIdentity` 的版本化摘要，Task Finish 可核对或复用。
5. 收尾时由真实 owner 停止 preview/process；worktree cleanup 在确认无 task-owned runtime 后才删除 checkout、branch 和 receipt。

## 关键变化

- 通用验证编排从 `test/` 生命周期迁入可发布 `src/` runtime。
- 新增公开验证 CLI 与稳定 JSON schema。
- Task Finish formal assurance 连接同一个 production executor。
- task preview stop 和 worktree cleanup 增加 fail-closed 所有权门禁。
- Candidate 增加普通 Workspace、双 task、错误 owner 和安装后 runtime 的组合证据。

## 影响、风险与兼容性

既有 CLI 不做破坏性修改；retained standalone preview 保持兼容。旧 task preview 缺少完整 metadata 时不会被猜测归属，而会保留现场并要求明确恢复。主要风险是迁移验证编排造成 Product Candidate 语义漂移，因此先以 characterization tests 固化行为，再切换测试消费者。

## 验收摘要

验收必须同时证明：当前 Candidate 组合 gate 恢复；两个 task 的可并行 worker 有真实重叠、coordinated resource 正确排队；错误 owner 无法停止 preview；运行中 preview 阻止 cleanup；tarball CLI 可在无开发 checkout 的普通 Workspace 完成同等验证；最终 evidence 绑定候选且清理无残留。

## 技术产物入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [Delta specs](specs/)
