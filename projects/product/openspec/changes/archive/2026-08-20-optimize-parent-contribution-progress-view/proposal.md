## Why

当前父任务页面按计划优先级展示 Contribution Map，实际子任务、Contribution Handoff 与依赖状态分散，用户难以直接判断哪些工作正在迁移、哪些已经有交付证明、哪些可以启动或仍被阻塞。现在需要把既有 Parent Coordination v3 事实转化为清晰的动态迁移进度视图，同时守住 Parent Plan 只表达长期协调意图的边界。

本变更不包含破坏性变更。

## What Changes

- 将父任务贡献项区域按“进行中 / 已交付”“可启动”“等待依赖”的固定顺序分组，并以中文展示全部用户可见术语和状态。
- 将 Parent Plan Contribution 与真实 Child Task、Contribution binding 和 Contribution Handoff 动态组合；展示实际子任务标题、任务编号、当前状态及进入子任务详情的导航入口。
- 只有匹配的 Contribution Handoff 才显示“已交付”；Child Task 的 `completed` 状态本身只显示“交付未证明”。
- 在贡献项中简洁汇总已交付、剩余工作、已取代和下一步行动；等待项明确展示依赖及阻塞原因。
- 保持 Parent Plan、Planning Review stale、Development、Review、Verification 和 Finish 的现有 authority；不写回普通进度，也不新增迁移台账或第二套进度存储。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `local-app-web-client`: 收窄父任务协调区域的动态迁移分组、中文呈现、实际子任务导航及交付证明要求。

## Impact

- 影响 `buildr-web` 的 Parent Coordination 前端投影、样式和浏览器验收测试。
- 复用现有 Parent Coordination v3 API 与任务详情路由；不修改后端写模型、持久化结构或公开 authority。
