# Local App 只读 store 与 root provenance 边界

## 一句话摘要

让 canonical Workspace 保持唯一 structured store，让 candidate/validation Workspace 使用自身临时 store，并让 Local App 对已解析 root 的只读读取不再触发 Git/worktree provenance 观察。

## 背景与问题

Workspace SQLite infrastructure 当前在只读打开时也执行 canonicality 的 Git/worktree 检查。Local App 已由 Workspace registry 将 `workspaceId` 解析为已登记 root，重复 `git rev-parse` 既扩大读取边界，也让候选/验证 Workspace 的本地 store 归属不够清晰。

## 目标与非目标

目标是把 provenance 校验收窄到 writable、migration 和 mutation 路径，保证每个 Workspace root 只使用自己的 `.buildr/local/workspace.sqlite`，并以调用边界测试证明 candidate 隔离与 canonical read 无 Git 依赖。非目标是新增数据库、改变 schema/migration、取消 writer guard 或允许 Local App 接收任意 filesystem root。

## 受影响角色

- 通过 Local App 查看已登记 Workspace Task 的用户。
- 维护 Workspace Structured Store、Task Application 与 candidate/validation 生命周期的 Buildr 维护者。

## 核心流程

Workspace registry 先把 `workspaceId` 解析为 root；Task Application 的只读查询只打开该 root 的 local store，不观察 Git。candidate/validation runtime 对自身 root 可初始化临时 store，但写 retained canonical root 仍在任何数据库 mutation 前被拒绝；retained runtime 继续维护 canonical store。

## 关键变化

- Structured Store read-only assertion 不再调用 checkout observer 或 `git rev-parse`。
- writable/migration provenance guard 保持不变。
- candidate/validation store 与 canonical store 按 root 隔离，不共享、不回灌、不同步。
- 增加 integration/system 调用计数、抛错注入和文件隔离证据。

## 影响、风险与兼容性

无需数据迁移或新增表。只读路径不再即时发现 Git topology 变化，但写入时仍重新校验 provenance；Local App 的 registry identity 与 root/path 拒绝边界保持不变。

## 验收摘要

Structured Store integration、Local App system/browser smoke 与 Product changed verification 通过；canonical read 为零 Git 观察，candidate 写入只影响自身 store，候选写 retained root 无文件副作用。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [workspace structured store spec](specs/workspace-structured-data-store/spec.md)
- [Local App spec](specs/local-workspace-application/spec.md)
- [tasks.md](tasks.md)
