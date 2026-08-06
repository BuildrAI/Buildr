## 1. Bounded read executor

- [x] 1.1 新增固定容量 Local App read executor，定义 FIFO 队列、容量上限、白名单 operation、稳定 queue-full/closed/cancelled 错误和 Worker 生命周期。
- [x] 1.2 新增 long-lived read Worker，独立组合 Buildr runtime，只执行 development、reviews、verification read view，并序列化受控结果或错误。
- [x] 1.3 为 executor 增加取消、Worker failure replacement、无重复派发和 pool close 的 Integration 测试。

## 2. Local App 接入

- [x] 2.1 将三个 Task 专业 GET route 接入 bounded executor，保留已解析 Workspace root、no-store、独立错误和 no-terminal-aggregate 边界。
- [x] 2.2 将请求断开与 server close 接入取消/释放语义，确保不遗留 Worker、队列或未结算 Promise。
- [x] 2.3 更新 Local App system tests，证明三个 Tab 各自只调用对应 read operation、并发受限、错误隔离且只读不触发 Git/worktree provenance。

## 3. Current knowledge 与直接反馈

- [x] 3.1 根据最终实现更新受影响的 technical/service current knowledge，说明 Local App bounded read executor 的边界与非目标。
- [x] 3.2 运行 affected Integration/System 测试并修复实现或测试暴露的问题；记录调用次数、最大并发、队列和取消证据。
- [x] 3.3 运行 OpenSpec strict validation，确认 proposal/design/spec/tasks 与实现保持一致并完成 Change-owned checklist。
