## Context

`task/change/application/change-application.ts` 同时读取 OpenSpec 文件并选择任务工作树（Worktree）；`openspec/module.ts` 的查询能力却只有清单读取。两者应按内容所有权分开，而非把任务关联数据一并迁走。

## Goals / Non-Goals

目标是一个 OpenSpec 内容查询实现供全局和任务入口复用，任务侧只确定副本与组合展示。非目标是改变任何 HTTP、页面、持久化、安全边界或工作树优先规则；不重构无关 OpenSpec 收敛实现。

## Decisions

- 在 `openspec/application/change-query.ts` 集中通用列表、详情、逻辑变更定位、产物与原型发现、操作提示词。其局部类型与私有文件函数同文件维护，避免额外碎片化。
- `openspec/module.ts` 的 `OPENSPEC_QUERY` 暴露具名查询方法；任务侧只消费必要方法，不导入文件读取实现，不反向给 OpenSpec 注入任务能力。
- `task/change/` 保留关联引用校验、工作树选择、候选与保留来源、原型任务身份及 HTTP 组合。`task_changes` 数据表不移动。
- 不采用整体移动 `task/change/`：那会把任务副本选择错误地归给 OpenSpec。也不保留通用方法的旧转发壳：内部调用方改为消费 OpenSpec 查询能力。

## Risks / Trade-offs

- 相对路径基准不同 → 保留明确的输出根与项目读取根参数，测试候选和保留内容并存。
- 归档编号或原型安全行为漂移 → 迁移原逻辑并保留、补充回归测试。
- 装配方法遗漏 → 编译、架构检查与真实任务 HTTP 测试验证具名能力连接。

## Migration Plan

先迁移查询及模块装配，再改测试消费者、补边界验证并更新现有地图。无数据迁移；失败时保留候选修改供修正，不更新保留工作空间。

## Open Questions

无。
