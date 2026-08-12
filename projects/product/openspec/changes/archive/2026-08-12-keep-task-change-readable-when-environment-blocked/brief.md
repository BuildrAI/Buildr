# Environment 阻塞时仍可读取 Task Change

## 一句话摘要

只要保存的 Environment Receipt 仍能证明 Task 的 Project 路径且 Change 目录可读，runtime、依赖或 projection 暂时阻塞也不会再把开发中的 Change 文档隐藏掉。

## 背景与问题

Task-scoped Change Resolver 过去调用完整 Environment live inspect，并把整体 `ready` 当作只读文档的前置条件。开发中的 worktree 和 Change 明明存在，只要 runtime projection、Workspace CLI 或依赖 probe 暂时 blocked，Local App 就会显示“OpenSpec Change 当前不可用”。这混淆了“能否安全读取已有文件”和“能否继续执行研发动作”两种能力。

## 目标与非目标

目标是让 Resolver 从持久化 Environment current 取得唯一候选路径 authority，在 `ready` 或 `blocked` 时独立验证 Task、Project scope、source path、root 归属和目录可读性。非目标是不放宽 Environment 执行门禁、不允许请求传入路径、不改变 Task Record 或全局 Change 索引，也不增加新的 store 或 writer。

## 受影响用户或角色

- 在 Local App 查看开发中 Task Change 的用户。
- 依赖 Task-scoped Change 的 Task Planning Identity、Planning Review 与 Development consumer。
- 诊断 Environment 阻塞、但仍需要阅读方案文档的 Agent。

## 核心流程

用户打开 Task 关联 Change 时，共享 Resolver 按 Task ID 读取 Environment saved current。若 Receipt 为 `ready` 或 `blocked`，且 matching Project scope、source path 和执行根归属仍可证明，Resolver 就从该候选根读取 Change；候选目录失效、Receipt cleaned、scope 不匹配或路径越界时只回退 retained Project。Environment 的阻塞诊断继续在 Environment read model 中展示，不转化为执行授权。

## 关键变化

- Task-scoped Resolver 从 live `inspectTaskEnvironment` 切换到 saved `readTaskEnvironmentCurrent`。
- 非共享 scope 强制 root containment；共享 scope 复用 Receipt 的显式 Project root ownership。
- Project identity、source path、目录存在性和既有 artifact/symlink 安全检查继续 fail closed。
- Local App、Task Record、Planning Identity 与 Review 不增加旁路，继续复用同一 Resolver。

## 影响、风险与兼容性

现有 Environment Receipt 无需迁移，公共 mutation API 与 Change provenance 不变。主要风险是使用已漂移的保存路径；通过 Receipt identity、Project registry path 对齐、root ownership 和当前目录检查限制为只读访问，任何无法证明的路径都回退或 unavailable。

## 验收摘要

- `ready` 与非路径类 `blocked` Receipt 都能读取合法 candidate-only Change。
- execution root 缺失、Project source path 不匹配或非共享 root 越界时不读取候选。
- 安装版 Local App 在 saved Receipt blocked、live inspect ready 的情况下仍从 Task worktree 返回 candidate provenance。
- retained fallback、全局 retained-only collection 和 Change artifact 安全校验保持不变。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [change-asset-indexing delta spec](specs/change-asset-indexing/spec.md)
