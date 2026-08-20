## Context

Parent Coordination v3 已经把 Parent Plan、真实 Child Task、Contribution binding、Contribution Handoff、启动就绪度和依赖阻塞组合为只读结果。当前 Web 却仍按计划优先级展示 Contribution Map，用户必须进入抽屉并自行拼接“计划工作项—实际子任务—交付结果”。页面中也残留 Parent、Child、Contribution、Planning Review 等英文术语。

本次只改变 `buildr-web` 的展示投影。后端 Application、Task Record、Development Receipt、Review/Verification Result、Finish Handoff 和 Parent Plan 写入路径保持不变。

## Goals / Non-Goals

**Goals:**

- 以真实迁移状态而非计划优先级组织父任务贡献项。
- 让用户在父任务中看到实际子任务并进入同一工作空间的子任务详情。
- 让“已交付”严格来自匹配 Contribution Handoff，并显式区分“任务已完成但交付未证明”。
- 用中文呈现全部用户可见业务术语和状态，保留稳定 ID 作为技术定位信息。
- 在卡片内直接呈现已交付、剩余工作、已取代、下一步行动、依赖和阻塞原因。

**Non-Goals:**

- 不改变 Parent Coordination v3 API、Parent Plan schema 或任何 writer。
- 不新增进度表、缓存、事件流或前端持久化状态。
- 不自动创建、完成、放弃子任务，也不触发 Plan reconcile、Planning Review stale、Verification 或 Finish。
- 不改变父子任务关系、Contribution binding 或 Contribution Handoff 的建立方式。

## Decisions

### 1. 在前端形成一次性迁移视图模型

组件以顶层 `contributions` 为计划工作项，以 `children[].boundContributions` 关联实际子任务，并只从 `children[].delivery` 读取交接摘要。分组规则固定为：

1. 已有关联实际子任务或已有交付处置的项进入“进行中 / 已交付”；
2. 未关联且 `eligibility.status=eligible` 的项进入“可启动”；
3. 其余未关联项进入“等待依赖”。

组内保持 Parent Plan 原有顺序，使视图稳定且不重新定义业务优先级。该模型通过纯函数即时计算，不保存到组件外。

备选方案是要求后端新增专用分组字段；这会复制已有事实并扩大 read model 契约，本变更不采用。

### 2. 交付证明只认 Contribution Handoff

卡片的“已交付”标签和 `delivered`、`residual`、`superseded`、`nextAction` 汇总只从匹配 Child 的 `delivery` 读取。Child 状态为 `completed` 但 `deliveryProven=false` 时，页面同时显示中文任务状态和“交付未证明”，不推断交付完成。

备选方案是把 Child `completed` 映射为已交付；这违反现有 Parent/Child authority，故拒绝。

### 3. 复用任务详情路由完成导航

`TaskDetailPage` 把工作空间内任务 URL 构造器传给协调面板；实际子任务标题和“查看子任务”入口都指向既有 `/workspaces/{workspaceId}/tasks/{taskId}` 路由。进入后仍是标准任务详情页，浏览器后退可返回父任务；Child 的父任务来源区继续提供父任务关系信息。

不新增侧路由、弹窗详情或独立迁移页面，避免产生第二套任务浏览体验。

### 4. 中文是界面契约，不改变内部标识

标题、标签、状态、空态、按钮和技术治理字段均使用中文；API 枚举、代码类型、稳定 Contribution ID 与 Task ID 保持原值。未知枚举使用明确中文兜底“未知状态”，不直接泄漏英文原值。

## Risks / Trade-offs

- [一个 Contribution 意外绑定多个 Child] → 展示全部匹配子任务，并分别标注交付证明，避免静默选择一个。
- [旧数据缺少 Child delivery] → 保留任务状态但显示“交付未证明”，不猜测历史交付。
- [交付摘要较长导致卡片拥挤] → 默认只显示非空摘要区，并使用紧凑列表；完整事实仍来自既有 read model。
- [导航改动影响任务详情刷新] → 复用现有 React Router URL 和 TaskDetailPage 生命周期，并用生产托管浏览器测试覆盖父到子跳转。

## Migration Plan

无需数据迁移。发布新前端构建产物即可启用动态视图；回滚前端构建即可恢复原按优先级展示，后端事实与持久化均不受影响。

## Open Questions

无。界面分组、中文术语和导航方式已通过 UI Preview 确认。
