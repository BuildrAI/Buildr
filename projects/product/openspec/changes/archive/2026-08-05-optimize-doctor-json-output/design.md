## Context

Doctor 先构建完整诊断 read model，再按 `--detail compact|full` 选择 JSON 投影；当前默认值是 `full`。`sync` 和 Component reconcile 通过 `spawnSync` 调用 `doctor --json`，既没有选择 compact，也没有显式输出上限或进程错误分类。大型 capability graph 会让健康 Doctor 的 stdout 超过 Node 默认缓冲区。

## Goals / Non-Goals

**Goals:**

- 让默认 Agent-readable Doctor JSON 保持小而完整地表达健康、finding 和下一步。
- 让完整 inventory 成为显式诊断选择。
- 让全部内部最终 Doctor consumer 使用一致、有限且可诊断的子进程策略。
- 保持 Doctor 检查逻辑、退出语义和 JSON schema identity 不变。

**Non-Goals:**

- 不减少 Doctor 实际执行的检查集合。
- 不为 Doctor 引入分页、数据库、缓存或第二套诊断模型。
- 不把 4 MiB 当作允许 compact 输出无限增长的产品目标。

## Decisions

### 默认 compact，full 显式 opt-in

`doctor --json` 默认投射 `targetRoot`、scope、Agent runtime、`ok`、summary、health、findings、repair plan 和 next steps。`--detail full` 保留当前完整 read model。相比保持默认 full 并只修复 sync，这能让公开的默认自动化入口也避免无用的大体积 inventory。

### 内部 consumer 显式选择 compact

`sync` 和 Component reconcile 仍显式传 `--detail compact`，不依赖公开默认值。这样后续默认策略变化不会悄然扩大内部输出。

### 4 MiB 有界缓冲加类型化错误

内部 Doctor 子进程使用共享 helper 和 4 MiB `maxBuffer`。4 MiB 与现有 sync 子进程上限一致，并为异常 findings 留出余量；超过上限时报告输出超限，`result.error` 的其他失败报告进程执行错误，只有子进程正常执行且退出非零才报告 Doctor 业务失败。

备选方案是改为异步流式 spawn，但当前调用需要同步完成最终门禁；流式实现会扩大控制流和错误处理面，第一版没有必要。

### 回归覆盖真实输出边界

测试构造 full JSON 超过 1 MiB、compact 仍有界且健康的 Workspace，证明默认/显式 detail 行为和内部最终 Doctor 不再触发误判；另覆盖真实 Doctor 失败与输出捕获失败的不同诊断。

## Risks / Trade-offs

- [默认 JSON 字段减少会影响旧调用方] → proposal 标记 breaking，并保留 `--detail full` 的明确迁移路径。
- [compact 仍可能因异常 findings 增长] → 保留 4 MiB 上限与独立超限错误，不静默截断或误报 Doctor 失败。
- [多个内部调用点行为漂移] → 使用共享 helper 并用静态/集成测试枚举 consumer。

## Migration Plan

1. 先更新 CLI 默认和帮助契约，保留显式 `--detail full`。
2. 将内部最终 Doctor consumer 收敛到共享 bounded compact runner。
3. 执行受影响验证和大输出回归；失败时回滚本 Change，不需要数据迁移。

## Open Questions

无。
