# 优化 Doctor JSON 输出与内部消费边界

## 摘要

让默认 Doctor JSON 面向健康判断保持紧凑，并让内部最终 Doctor consumer 以有界、可分类的方式执行。

## 背景与问题

当前 `doctor --json` 默认输出完整 capability、runtime 和资产 inventory。大型 Workspace 的健康输出可能超过 Node `spawnSync` 默认 1 MiB 缓冲区，使 `sync` 因 `ENOBUFS` 错误返回 exit 1，并误报最终 Doctor 未通过。

## 目标与非目标

- 默认 `doctor --json` 返回 compact 结构，完整 inventory 通过 `--detail full` 获取。
- `sync` 与 Component reconcile 显式使用 compact、4 MiB 有界缓冲，并区分业务失败与进程失败。
- 不改变 Doctor 检查集合、健康语义、非 JSON 文本输出或 schema identity。
- 不引入分页、缓存、数据库或第二套诊断模型。

## 受影响用户与流程

Agent 的默认结构化诊断输出变小；依赖默认 full inventory 的调用方需显式增加 `--detail full`。Workspace sync 和 Component reconcile 在健康但 full 输出较大时不再误判失败。

## 关键变化

- JSON 默认详细度由 full 改为 compact。
- 内部最终 Doctor consumer 使用共享 bounded compact runner。
- 输出超限、进程执行失败与 Doctor 业务失败分别报告。

## 影响、风险与兼容性

默认 JSON 字段集合减少属于公开行为变化；`--detail full` 提供明确兼容路径。compact 仍保留 `ok`、health、findings、repair plan 和 next steps。

## 验收摘要

默认 compact 与显式 compact 等价；显式 full 保留完整 inventory；full 超过 1 MiB 时 sync 仍能基于 compact 结果成功；三类失败具有不同诊断。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/agent-readable-doctor/spec.md`
- `specs/buildr-product-capability-sync/spec.md`
- `tasks.md`
