# 移除任务生命周期重复投影

## 一句话摘要

删除 Workspace SQLite 中重复维护的 `task_lifecycle_current`，让各专业 current 表保存自己的正式事实，并由 Task Overview 一次联表读取任务全貌。

## 背景与问题

Task、Environment、Development、Review、Verification 与 Finish 已分别拥有唯一 Application 和 SQLite current authority，但每次专业写入后仍会把摘要再次投影到 `task_lifecycle_current`。该副本平均约 13 KB/Task，只有部分 Task 有 row，并已出现 Environment 投影与权威 row 不一致；它增加了跨模块写入耦合、失败门槛和用户升级成本。

## 目标 / 非目标

- 目标：专业 action 与所属 current row 原子保存业务事实/正式观察；Overview 和专业 GET 只组合保存值；连续 migration 安全迁移旧用户数据并删除重复表。
- 非目标：不把所有专业状态塞入 `tasks`，不建设事件流、history、cache、物化视图、通用状态机或第二个 terminal authority。

## 受影响用户或角色

- 使用 Buildr Local 查看正式 Task 全貌、研发、证据、环境与交付终态的维护者。
- 通过 Task Development/Review/Verification/Environment/Finish Application 推进正式任务的 Agent。
- 从旧 Buildr 版本升级现有 Workspace SQLite 的用户。

## 核心流程

1. 专业 Application 在合法 action 中形成并原子保存自己的 current fact；读取不重新观察外部世界。
2. Task Overview 用一条 SQLite `LEFT JOIN` 查询组合 Task 与专业摘要；各页签仍读取所属专业 current row。
3. 新 runtime 通过连续 migration 回填查询字段、迁移可证明的 Development applicability、核验 Finish association，最后删除 `task_lifecycle_current`。

## 关键变化

- Development Receipt 与 applicability 同事务保存；Review/Verification row 增加 target/outcome/time 查询字段。
- Environment、Task 与 Finish 直接使用既有专业 authority；terminal association 只从 Finish completion 读取。
- `task verification inspect`只比较显式保存identity，不再接受`--declaration-root`；声明路径只在正式`record`动作中观察。
- 删除 lifecycle repository/application、六类 projection writer、Finish runtime refresh 与 package/runtime 残留。

## 影响 / 风险 / 兼容性

- 旧数据库只前向升级；migration 中任一无法证明的 terminal association 或数据约束失败会完整 rollback。
- 缺少可迁移 lifecycle snapshot 的 Development row保留Receipt并显示unknown，等待下一次正式Development action刷新。
- 公开Task/专业读取形状尽量兼容；内部`task_lifecycle_current`表和projection methods被移除，`inspect --declaration-root`作为旧读时观察入口被关闭。

## 验收摘要

- fresh与全部旧ledger起点可升级到latest，专业payload保留且latest schema无`task_lifecycle_current`。
- Environment冲突以专业row为准；无法匹配terminal association时fail closed且数据/ledger零部分更新。
- Overview单查询与各专业GET不执行Git、文件、declaration、Environment probe或写入。
- checkout、npm package、Local App与Doctor/package verification无Lifecycle可执行残留并保持一致。

## 技术 Artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Implementation tasks](tasks.md)
