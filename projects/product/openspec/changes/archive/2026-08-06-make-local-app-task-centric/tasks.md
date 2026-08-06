## 1. Task-scoped Change 阅读边界

- [x] 1.1 移除 Local App 的全局 Change 路由、导航、目录、详情和 Change-specific prompt/API 表面，保留 Task-scoped Change resolver。
- [x] 1.2 收紧 Local App Task update 输入，禁止页面通过 `addChanges` 或 `removeChanges` 维护 Change 引用。

## 2. 任务概览

- [x] 2.1 让 Task 概览按已保存的 Change 引用读取并优先展示每个可用 Brief，同时保留无 Brief、解析失败和无关联 Change 的真实状态。
- [x] 2.2 保留从当前 Task 进入关联 Change artifacts 的只读链接，并调整页面文案、布局和窄屏样式。

## 3. 验证与知识收敛

- [x] 3.1 更新 Local App HTTP/Web、Task Record 和 Change reader 的 focused tests，覆盖全局入口移除、禁止 Change mutation 与 Task-scoped Brief 场景。
- [x] 3.2 更新 Browser smoke 和相关 current knowledge，运行 OpenSpec、受影响静态/集成与浏览器验证。
