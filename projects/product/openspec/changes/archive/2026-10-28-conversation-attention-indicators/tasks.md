## 1. 完整范围汇总与筛选

- [x] 1.1 在 `buildr-agent` 的列表查询中按既有主状态顺序加入互斥分类、`activityCounts` 和 `activityState`，保留空间边界、隐藏兼容和最新消息排序；用 `test/integration/conversation-activity.test.ts` 验证重叠状态、跨空间、隐藏活动、旧记录及未加载页汇总。
- [x] 1.2 同步应用层、`operation-schemas.ts`、宿主 `services/buildr/src/modules/agent-service/interfaces/http/agent-service-http.ts` 与前端客户端（Client）的可选参数和响应类型，分类加入分页身份；以请求契约（Contract）检查和集成测试（Integration Test）验证旧请求兼容、非法分类拒绝及过期分页处理。

## 2. 入口提醒与共享分类

- [x] 2.1 扩展现有 `ConversationActivityEntry` 及局部样式，同一列表按钮内区分活动和需关注角标，加入精确说明、无障碍名称、零值/大数/未知/过期反馈；用前端单元测试（Unit Test）覆盖八条活动五条需关注、零值、`99+` 及读取失败。
- [x] 2.2 在浮窗和完整列表复用分类数量与筛选，接入服务端完整范围汇总，保持工作空间分组、消息排序和原双入口行为；用列表与执行统计测试验证分类互斥切换、清除、跨空间重置、迟到响应隔离和未加载页定位。
- [x] 2.3 保留准确查看确认边界，分类及悬停不写 `seenThrough`，点击条目只打开准确对话；以既有对话浏览器场景（Browser Scenario）补充键盘、Escape、触屏完整列表、历史固定时不弹浮窗及查看前后计数变化检查。

## 3. 认知校准与整体检查

- [x] 3.1 实施后复核 `knowledge/docs/architecture/agent-integration.md` 中侧轨数字与活动说明，按已授权范围校准；未获知识维护授权则保留原文并报告具体建议，不写成已更新。核对源文件与说明一致；仅在职责新增时更新相关代码地图（Code Map），不重画无关关系图。
- [x] 3.2 通过产品真实包装入口执行受影响服务的静态检查（Static Check）、单元测试（Unit Test）、活动查询及宿主透传的集成测试（Integration Test），检查查询、统计、分页和界面共同边界；失败如实处理，不以规划校验冒充运行验证。
- [x] 3.3 在隔离预览的正式构建界面检查同一按钮两个角标、三位数、窄侧轨、窄屏、键盘焦点及全部/需关注分类定位，无重叠、无闪烁、不误确认查看；只使用受控数据，不调用付费模型。
