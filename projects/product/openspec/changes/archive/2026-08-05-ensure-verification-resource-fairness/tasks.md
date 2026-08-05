## 1. 公平协调模型

- [x] 1.1 为 coordinated resource 实现 owner-bound、带 TTL/heartbeat 的最小等待 ticket
- [x] 1.2 让 slot 只授予容量范围内最早的有效 waiter，并在成功、取消、timeout 与异常路径精确清理 ticket
- [x] 1.3 保留现有 lease ownership、recovery、release 和 transient evidence 边界

## 2. 验证与契约

- [x] 2.1 增加多 waiter 顺序、capacity、多次新 waiter 不得抢占的确定性测试
- [x] 2.2 增加取消、timeout、崩溃、stale ticket recovery 与越权清理拒绝测试
- [x] 2.3 更新 Task Verification contract、Skill 和验证实践文档，保持 Project declaration 与 portable Result schema 不变
- [x] 2.4 执行 focused、Task-affected 与完整 Candidate 验证，记录资源等待 timing 和并发事实
  - focused：Integration 229/229，通过；公平队列 Integration 连续 10 轮与跨进程 System 3/3，通过
  - Candidate：114.937 秒，coordinated resource 等待 2–4ms，两个 `workspace-saturating` slot 并发使用且均精确释放
  - 唯一失败为当前 `dev` 可复现的 macOS launcher 动态 `libnode` 缺失基线问题，不属于本 Change
