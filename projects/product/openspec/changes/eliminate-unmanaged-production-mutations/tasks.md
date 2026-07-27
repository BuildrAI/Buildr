## 1. 文件系统入口

- [x] 1.1 为 runtime 暴露精确路径清理能力并保持现有文件系统注入边界
- [x] 1.2 将 OpenSpec 临时投射的目录、文件和清理操作迁移到受管入口
- [x] 1.3 将 Task Finish 大诊断文件迁移到目录与 atomic writer 入口

## 2. 回归与认知

- [x] 2.1 补充或调整契约测试，覆盖注入入口和原有输出、清理行为
- [x] 2.2 完成 Brief、knowledge impact 与术语核对
- [x] 2.3 运行 `managed-mutations` 和受影响验证

## 3. 完整验证与交付

- [x] 3.1 运行完整 Candidate 并记录验证证据
- [ ] 3.2 归档 Change、集成并推送 `dev`
- [ ] 3.3 对齐 retained runtime 并安全清理任务环境
