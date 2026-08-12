# 修复安装版 Local App 的 Task Change 读取

## 一句话摘要

让安装版 Local App 通过唯一的 Task Environment Application 读取 matching worktree 中的 Change，同时继续把所有 Environment mutation 限制在可信 retained Environment Manager。

## 背景与问题

Task Environment Receipt 记录的是创建环境时的 controller source 与 CLI；安装版 Local App 则从 bundle 运行，二者的 sourceRoot 正常不同。当前只读 `inspect` 错把 bundle 当作 mutation manager 检查，导致 Environment 读取被阻断，Task-scoped Change resolver 只能回退 retained Project，遗漏 candidate-only Change。

## 目标与非目标

目标是让 matching Receipt 的只读 probe 使用 Receipt controller，向 Local App 返回当前的 candidate/retained Change provenance，并以测试证明 bundle source 差异不会改变读取结果。

非目标是不新增 Receipt reader、路径参数、Change store、manager allowlist、worktree 操作或任何 mutation 授权；全局 Change 仍只索引 retained source。

## 受影响用户或角色

- 从安装版 Local App 查看正式 Task 的人。
- 使用 Task-scoped Change resolver、Review 与验证入口的 Agent。
- 负责 prepare、资源管理与 cleanup 的 retained Environment Manager。

## 核心流程

Local App 以 canonical Workspace、Task ID 和限定 Change 调用共享 resolver。resolver 通过 Task Environment Application `inspect` 读取 Receipt；`inspect` 使用 Receipt controller 对已登记 execution root 做既有有界 probe。probe ready 时，resolver 读取该 execution root 的 Change 并返回 candidate provenance；probe 不可用时才按既有规则回退 retained Project。所有 mutation 入口仍独立校验当前 retained manager。

## 关键变化

- 分离 Receipt-bound read controller 与 retained mutation manager 两种使用边界。
- 保留 Task-scoped resolver 的安全输入和 Local App route；不增加接口路径输入。
- 追加 bundle sourceRoot 不同、candidate-only Change、retained-only 全局索引及 mutation fail-closed 的回归覆盖。
- 对齐 glossary、技术架构与 Buildr Service 当前认知中的 manager/inspect 表述。

## 影响、风险与兼容性

没有 Receipt schema 或 API 迁移。Receipt controller 不可执行、候选根漂移或 probe 失败时，`inspect` 仍返回 blocked，不猜测路径也不写入恢复。bundle 无法借此获得 manager capability；已有 mutation gate 不变。

## 验收摘要

- bundle productRoot 与 Receipt controller sourceRoot 不同的 `inspect` 仍返回真实 read model。
- Local App Task detail 能读取 candidate-only Change 并显示 `task-environment-candidate`。
- `prepare`、resource mutation、`cleanup` 对 candidate/非 manager/dirty source 继续 fail closed。
- 全局 Change collection 不出现未集成 candidate。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Environment delta](specs/task-environments/spec.md)
- [Change indexing delta](specs/change-asset-indexing/spec.md)
- [Implementation tasks](tasks.md)
