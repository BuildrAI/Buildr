## 1. Local App 交互

- [x] 1.1 在全局 Change 详情增加按需展开的“关联到已有 Task”面板，初始渲染不发起 Task 请求。
- [x] 1.2 使用 active Task 轻量查询投影展示候选 Task，并明确无 active Task 时交给 Agent 的 prompt action。
- [x] 1.3 提交带 `expectedRecordDigest` 的 `addChanges` mutation，处理成功导航、已关联项和冲突刷新状态。
- [x] 1.4 让 start-work Agent prompt 支持从 Change 详情预填 Project 与 Change identity 目标。

## 2. 样式与契约测试

- [x] 2.1 增加关联面板的窄屏/桌面样式，并保持现有 Change 详情布局与 retained/task-scoped 文案边界。
- [x] 2.2 增加 Local App Web 静态契约测试，证明首屏无 Task 读取、按需使用轻量查询、使用 CAS mutation 和正确的 Agent fallback。
- [x] 2.3 增加系统/集成测试，证明 Task Record Application 保存 Change reference、冲突不覆盖，以及 Task-scoped Change resolver 行为不变。

## 3. 验证准备

- [x] 3.1 运行 OpenSpec validate、受影响的 Local App/Task Record focused tests 和产品静态验证。
- [x] 3.2 按最终实现更新 knowledge impact/Brief，并为后续 Task Development 收敛 Change disposition 与正式验证保留当前证据入口。
