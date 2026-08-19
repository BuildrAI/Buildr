## Why

Buildr Web 当前把 Parent 最终集成验收缺口展示成“前置条件未满足”，却没有优先呈现 Parent 当前是否可推进、推荐下一步、可启动 Contribution 与真实启动阻塞；同时 Planning Review 字段映射错误会直接显示 `undefined`。这使用户难以从父任务页面判断应当启动哪个 Child，也无法用“名称 + 编号”准确识别候选 Contribution。

## What Changes

- 将 Parent Coordination 的当前推进状态、推荐下一步、可启动 Contribution 和真实启动阻塞提升为首要信息。
- 可启动 Contribution 必须同时展示 Parent Plan 已保存的面向用户计划结果与稳定编号，例如“收敛根工程职责（`engineering-root-layout`）”。
- 将全部 Contribution 尚未交付表达为“最终验收进度”，不再冒充当前启动阻塞。
- 按可启动、进行中、等待依赖、已交付、残留、已替代和交付未证明等状态组织 Contribution，并保留 Child 承担与交付证明。
- 修复 Planning Review 的公开 read model 字段映射，展示 outcome、applicability、摘要与时间，禁止向用户暴露 `undefined`。
- 保持 Parent Coordination 为只读动态投影，不新增 progress store，不复制 Child 专业状态，也不自动创建、完成或接受 Child/Contribution。
- 本 Change 不包含破坏性变更，不删除或重定义现有 HTTP JSON 字段，也不改变 Task Record、Parent Plan、Contribution Handoff 或各专业 Application authority；Parent Coordination MAY 只读追加展示所需的派生依赖事实。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `local-app-web-client`：调整 Task 详情的 Parent Coordination 信息层级、Contribution 标签、启动 readiness、最终验收进度和 Planning Review 展示要求。

## Impact

- Buildr Web Frontend：Task 详情页 Parent Coordination 页面内组件、类型、派生展示逻辑与局部样式。
- Buildr Web Runtime：继续复用现有 `/api/v1/tasks/:taskId/coordination` read model；仅在测试夹具需要时补齐公开响应样例，不新增 writer。
- 测试：前端构建、React/HTTP 集成、生产托管 browser smoke、稳定 DOM 钩子与 `web-dist` 一致性。
- 依赖与 CSP：继续使用现有 Ant Design 5 和同源构建，不新增依赖、CDN、远程字体或远程脚本。
