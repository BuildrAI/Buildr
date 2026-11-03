## Context

共享状态组件在 waiting 时依赖 executing 参数拼接第二标签。

## Goals / Non-Goals

每条对话只展示一个状态；不修改真实运行、统计、排序或控制能力。

## Decisions

移除展示组件的 executing 参数及调用方传值，继续使用既有 activityState 的待决策优先分类。真实运行统计与展示独立，不因隐藏标签而减计。问题消失后沿用原分类回落。

## Risks / Trade-offs

待决策条目不再直接展示仍执行事实，但顶部执行分布及真实控制保持可用。无数据迁移，无接口兼容风险。
