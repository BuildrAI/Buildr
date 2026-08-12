# 实现任务

- [x] 1.1 定义 safe handler registry、执行结果与停止原因模型
- [x] 1.2 增加 `task finish run` 或等价 `advance --execute-safe` CLI 入口
- [x] 1.3 在现有 checkpoint 上循环执行并保持 lease/fingerprint/evidence 语义
- [x] 2.1 自动执行确定性 doctor、guard、Git observation 与 evidence completion
- [x] 2.2 并行化无依赖只读 observation，并保持准确 wall-clock
- [x] 2.3 增加正常完成、blocked、resume、幂等和并发 fencing 集成测试
- [x] 3.1 更新 Brief、knowledge impact 与任务看板
- [x] 3.2 完成 strict/proposal guard、affected 验证和真实 finish timing 验收
