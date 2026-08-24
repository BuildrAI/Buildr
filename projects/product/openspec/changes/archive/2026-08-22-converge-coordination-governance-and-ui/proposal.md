## Why

前序治理重构已经把 Delivery、Activation、Cleanup 与 Diagnostics 分离，也建立了专业 read model，但协调入口仍会把普通 Agent 分工误导为正式 Child、把 routine Declaration maintenance 一律升级为人工授权，并让用户在多个技术区域自行拼接任务结果。现在需要收敛这些人机边界，使 Buildr 只在真实长期决策或危险动作上中断用户。

本变更不包含破坏性数据迁移，也不引入 legacy Parent correction、terminal Task correction 或自动迁移。

## What Changes

- 明确正式 Parent/Child 只表达具有独立交付目标、scope、evidence 与 Handoff 的 Contribution；普通并行调查、临时分工和局部实现协作不强制创建正式 Child。
- 将 Declaration Intake 分成只读发现、可由 Agent 在既有适用范围内执行的 routine maintenance，以及会改变长期 scope、applicability、capability 或外部效果的用户决策；仅最后一类必须中断用户取得精确授权。
- 扩展 Task Overview 专业组合查询，直接返回面向用户的目标、Delivery、Activation、Cleanup、局部 attention 与必要 authorization 摘要，不复制专业 Result 或建立新的 UI authority。
- Buildr Web 在任务概览优先展示上述用户摘要；技术 identity、gate 与 Receipt 事实继续留在可展开技术区域。
- 统一 Task、Project 与 Service 页面使用的具名 Workspace 相对 Markdown 引用解析，区分“引用可解析”与“正文当前可读取”，并继续通过已登记 scope 与 Project Document API 安全打开。
- 保留已经验收的 Parent Contribution 四项摘要、紧凑横向行、Child 导航和详情侧栏，不重建第二套 Parent 进度模型。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `parent-child-task-coordination`: 明确正式 Child 的独立 Contribution 适用门槛，并排除普通 Agent 分工。
- `project-declaration-intake`: 区分 routine maintenance 与改变长期适用性的用户授权决策。
- `task-overview-query`: 增加由专业 current facts 派生的用户结果与必要授权摘要。
- `local-app-web-client`: 优先呈现用户摘要，并统一安全的 Workspace 相对 Markdown 引用体验。

## Impact

- Product canonical specs、Declaration Intake 与 Task/Environment/Verification 相关 workspace Skill source。
- Buildr Task Overview Application/read model、HTTP JSON 与集成测试。
- Buildr Web Task 概览、共享 Markdown 引用解析、Task/Project/Service 文档打开交互、单元与浏览器测试。
- `buildr` 消费的 tracked `web-dist`。
- 不新增 SQLite 表或 writer，不改变 Parent Plan、Task Record、Development、Finish、Environment 或 Project Document 的 authority。
