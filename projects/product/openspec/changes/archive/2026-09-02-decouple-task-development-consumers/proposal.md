## Why

任务研发（Task Development）的候选、交接和统一推进状态仍被任务入口、总览、终态展示、任务审查、父子历史和 Buildr Web 当作共同完成依据，导致专业结果和真实交付在缺少 Development Receipt 时无法独立使用。任务验证已完成解耦，现在需要收敛其余消费者，才能依据真实任务、产物和专业结果继续工作。

## What Changes

- **BREAKING**：任务入口不再把 Task Development 作为统一下一步路由器，专业技能按用户目标和当前事实直接发现。
- **BREAKING**：任务总览、终态交付与 Buildr Web 不再通过 Candidate、Development Handoff 或统一 `proceed/blocked` 判断目标完成、交付或专业结果适用性。
- 任务审查直接绑定实际规划或成果身份，不再依赖 Development Candidate 或终态 adoption association。
- 父子任务历史读取从 `task_development_current` 迁移到 Task-owned 历史字段；旧计划只读保留。
- 旧 Finish run、旧 Development Receipt 和交接继续作为历史证据保留，但不参与新的 current 判断。
- 保留并修改的实现、测试、fixture 与 helper 迁移为 TypeScript 单一人工源码；确定删除的代码及专属测试直接删除。
- 更新 Buildr Web、HTTP、CLI、Skill、能力绑定、当前认知与架构说明，使各入口读取同一专业事实而不建立聚合 writer。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-entry-snapshot`: 收窄或退役统一 Task next 路由，不再把 Development 作为专业动作入口。
- `task-overview-query`: Overview 只读组合独立事实，不再解释 Development gate 或交付完成。
- `task-record`: 为旧 Parent Plan 提供 Task-owned 只读历史位置，停止从 Development current 读取。
- `task-review-results`: Review read model 与终态展示不再依赖 Development 或 Finish association。
- `task-delivery-finish-module-architecture`: Terminal Delivery 只读取 Task Record 和旧 Finish 历史，不再聚合 Development/Review。
- `buildr-web-workspace-application`: Task 页面分别读取任务、审查、验证和历史交付事实，不以 Development 建立页面级 authority。
- `product-agent-skills`: OpenSpec 与任务技能不再要求 Development 作为所有正式专业动作的统一前置。

## Impact

- Buildr Service：Task Entry、Overview、Terminal Delivery、Task Record 历史读取、Review HTTP、Bootstrap module wiring、SQLite migration、Skills 和能力清单。
- Buildr Web：任务详情、成果摘要、Development/Evidence 展示和 Agent action。
- 数据：迁移旧 Parent Plan 到 Task-owned 历史；保留旧 Development/Finish payload 原始历史，不建立长期 dual-read。
- 兼容性：旧 Development 聚合和退役 Parent/Finish 写入口不再用于当前流程；已有历史仍可查看。
