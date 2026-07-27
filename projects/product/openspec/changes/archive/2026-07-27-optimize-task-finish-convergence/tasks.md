## 1. 收敛计划与状态机

- [x] 1.1 实现 changed paths 的 runtime、CLI、Local App 与 unknown 影响分类
- [x] 1.2 在 finish plan 中增加 integration-push 后的 retained-convergence 步骤并保持旧 run 兼容
- [x] 1.3 让 Action Registry 使用 retained root 与绝对 CLI invocation 生成按需 doctor/sync 计划

## 2. Provider 交接与证据

- [x] 2.1 让 runtime-install provider 消费 retained impact evidence，无入口影响时返回 not-applicable
- [x] 2.2 记录 retained identity、影响分类、实际 stages、跳过原因和最终 doctor 结果
- [x] 2.3 覆盖缺失输入、未知路径、runtime-only、默认入口影响和失败恢复测试

## 3. 产品资产与当前认知

- [x] 3.1 更新随包 task-finish Skill、CLI 文档和 Service 当前认知
- [x] 3.2 完成 Brief、knowledge impact、术语核对和 task asset review
- [ ] 3.3 从 retained checkout 更新并验证任务看板

## 4. 验证与交付

- [ ] 4.1 完成 OpenSpec guard、受影响验证和最终 Candidate 验证
- [ ] 4.2 归档 Change、集成并推送 `dev`
- [ ] 4.3 对齐 retained runtime 并安全清理任务环境
