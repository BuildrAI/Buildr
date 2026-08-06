## 1. Direct tab read composition

- [x] 1.1 在 `task-terminal-delivery-application` 中增加只读取 Task Record 与 lifecycle terminal association 的窄 terminal section helper。
- [x] 1.2 改造 development、reviews、verification 三个 view，分别调用自身专业 reader 与窄 terminal helper，移除对 `inspectTaskTerminalDelivery` 的调用。
- [x] 1.3 保持三个公开 operation result schema、terminal 字段、active/terminal 状态和缺失关联诊断兼容。

## 2. Regression and performance evidence

- [x] 2.1 增加三个 Tab 的 unit/integration 回归，证明每个 endpoint 只读取自身专业 current record、Task Record 与已写交付关联。
- [x] 2.2 增加调用次数断言，证明单个 Tab 不触达其他专业 reader、不调用完整 terminal 聚合器，且读取次数不随其他 Result 数量增长。
- [x] 2.3 运行受影响测试、OpenSpec strict validation 与 changed verification，记录测试结果和调用次数证据。

## 3. Knowledge and convergence

- [x] 3.1 根据最终实现检查 Change Brief、delta spec 与当前实现边界一致，处理真实 terminology/knowledge impact。
- [x] 3.2 收敛 Change artifacts 与任务进度，形成稳定 Content Target 前保留 structured store 和非阻塞执行器为后续任务范围。
