## Why

`task_lifecycle_current` 把 Task、Environment、Development、Review、Verification 与 Finish 已持久化的 current 事实再次复制成一份约 13 KB/Task 的 JSON 投影，并已出现 Environment 投影与 `task_environment_current` 权威状态不一致。当前所有专业事实都已进入同一个 Workspace SQLite，继续维护第二份 current 副本只会扩大写入耦合、漂移和迁移成本；现在适合把读取模型收敛为专业表的保存事实与一次 SQLite 联表查询。

## What Changes

- **BREAKING（内部持久化）**：通过新的连续 migration 原子迁移可保留的正式观察、核验 terminal association，并删除 `task_lifecycle_current`；不修改已登记 migration 的 bytes/checksum。
- Task Development 在每次合法 action 中计算并与 Receipt 同事务保存最后一次正式 applicability 观察；读取不再借助 lifecycle 投影重新证明外部事实。
- Review、Verification current 表保存可查询的 target、outcome 与更新时间；完整 Result JSON 仍是各专业事实，是否被当前 Development 采用继续由 Development gate 表达。
- Environment、Task 与 Finish 直接使用现有 `task_environment_current`、`tasks`、`task_finish_runs`/`task_finish_completions`，terminal association 只由 Finish completion 保存。
- 新增只读 Task Overview 查询，以一条 SQLite 联表查询组合 Task 与专业 current 摘要；各专业页签继续调用各自 Application reader。
- 删除 lifecycle repository/application、所有 projection writer、Finish runtime refresh 和相关 package/runtime 接线；更新 Local App、验证与当前产品说明。
- 升级覆盖 fresh、各旧版本、完整/部分 lifecycle、权威冲突、无法迁移 terminal association、迁移中途回滚、旧 runtime 读取新库等用户数据场景。

## Capabilities

### New Capabilities

- `task-overview-query`: 以一次纯SQLite联表查询组合Task与专业current摘要，不建立聚合store或第二writer。

### Modified Capabilities

- `task-lifecycle-read-model`: 完整退役持久化跨专业副本、projection writer与terminal association snapshot。
- `workspace-structured-data-store`: 增加连续迁移、专业 current 查询字段、旧数据迁移校验与 `task_lifecycle_current` 退役规则。
- `task-development`: 将最近一次正式 applicability 观察收敛到 Development current row，并让 inspect 只消费保存事实。
- `task-review-results`: current row 保存可查询 target/outcome/time，读取匹配关系只比较已保存 identity。
- `task-verification`: current row 保存可查询 target/outcome/time，读取不再依赖 lifecycle 快照。
- `task-record`: Local App Overview 通过只读聚合查询展示专业 current 摘要，同时保持 Task Record 顶层 authority 不变。
- `local-workspace-application`: 五个 Task 页签与 terminal delivery 只消费专业 current/Finish completion，不再读取 lifecycle snapshot。
- `cli-product-surface`: `task verification inspect`只接受显式identity比较，不再接受`--declaration-root`读时路径；该参数仅保留给正式`record`观察。
- `buildr-package-assets`: package/runtime 验证删除 lifecycle projection 残留并覆盖新 migration、Overview 与专业 reader parity。

## Impact

- SQLite schema 与迁移：`src/infrastructure/sqlite/migrations/`、Workspace Store migration/Doctor/package 验证。
- Domain/Application/repository：Task Development、Review、Verification、Environment、Finish、Terminal Delivery、Task Record/Overview 与 runtime composition。
- Local App：Task 详情 Overview、研发、证据、环境与终态交付读取链。
- 测试与文档：migration 升级矩阵、专业 action 原子性、纯读取零副作用、terminal association、package residual gate、任务生命周期架构说明。
