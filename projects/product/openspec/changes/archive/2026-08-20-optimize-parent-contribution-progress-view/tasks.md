## 1. 动态迁移投影

- [x] 1.1 在 `parentCoordination.ts` 建立由 Contribution、实际 Child binding 与 Contribution Handoff 组合的纯只读迁移视图模型，并覆盖三组互斥分类、交付证明和中文状态单元测试
- [x] 1.2 在父任务协调面板按“进行中 / 已交付”“可启动”“等待依赖”顺序渲染迁移卡片，展示依赖、阻塞原因及非空交付摘要

## 2. 中文界面与子任务导航

- [x] 2.1 将父任务与子任务协调区域的用户可见业务术语、状态、按钮和空态统一为中文，并为未知枚举提供中文兜底
- [x] 2.2 复用工作空间任务详情路由，使实际子任务标题和显式操作均可导航，并保持父子任务 authority 不变
- [x] 2.3 调整桌面与窄屏样式，确保分组、子任务信息、摘要和等待原因可读

## 3. 验证与当前认知

- [x] 3.1 更新现有 Buildr Web 浏览器测试，覆盖分组顺序、中文文案、completed 未证明、Contribution Handoff 摘要和父到子导航
- [x] 3.2 运行 `buildr-web` 相关静态、单元与生产托管浏览器反馈，修复本 Change 引入的问题
- [x] 3.3 收敛 Change Brief、`buildr-web` Service 当前认知、术语影响与 knowledge impact evidence
- [x] 3.4 通过 OpenSpec strict validation、语义收敛预检并确认 Change archive readiness
