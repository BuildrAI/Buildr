## 1. 产品停止边界

- [x] 1.1 定义阻塞身份、恢复策略和通用解决授权，并兼容迁移旧 finish run
- [x] 1.2 让 resume、advance、safe executor 和 typed recovery 拒绝越权覆盖产品阻塞
- [x] 1.3 覆盖语义冲突、正式保证失败、重要集成冲突、新输入与授权恢复旅程

## 2. 计时与可观测性

- [x] 2.1 接入与当前候选身份绑定的受信验证计时摘要
- [x] 2.2 分离产品执行、提供者执行、检查点等待与不可观测区间，并保持旧字段兼容
- [x] 2.3 增加外部验证真实耗时、手写 duration 拒绝和重试阶段计时测试

## 3. OpenSpec 审计与退役

- [x] 3.1 在 observer/receipt 边界实现 before、expected、actual 的只读逐文件审计
- [x] 3.2 提供 `buildr openspec audit` 公开命令和结构化 `recovery-unprovable` 诊断
- [x] 3.3 建立旧接口退役登记、结构化弃用提示和零消费者契约门禁
- [x] 3.4 覆盖已应用未写回执、部分异常、缺失回执、旧入口兼容和新路径零旁路状态旅程

## 4. 产品资产与验证

- [x] 4.1 更新 Task Finish/OpenSpec 受管入口与当前认知，只保留产品命令和中文结果边界
- [x] 4.2 运行 OpenSpec strict、聚焦单元/集成/契约测试和 required affected verification
- [x] 4.3 完成资产观察结论并核对主工作区与其他任务工作树未被修改
