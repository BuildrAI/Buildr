## 1. 契约与共享 Git 事实

- [x] 1.1 将 canonical Task Contribution 观察实现下沉为 Development 与 Finish 共用的基础设施，并保留兼容入口
- [x] 1.2 让 Git-backed Content Target component 使用 Task Contribution identity，非 Git 或不可证明来源继续 fail closed

## 2. Development 适用性

- [x] 2.1 修正 Task Development inspect/observe/freeze，使纯 Delivery Baseline 前进保持既有 Candidate、gates、decision 与 handoff current
- [x] 2.2 更新 Task Development Skill、capability contract 与相关产品说明，明确 Agent 语义核对和 Buildr 确定性事实边界

## 3. 测试

- [x] 3.1 增加真实 Development fixture，覆盖无关基线前进后 gates current、handoff current 与 generation 不增加
- [x] 3.2 覆盖贡献变化、同路径基线变化、冲突或无法证明时返回 Development
- [x] 3.3 串联真实 Development 与 Finish，验证最新基线 Carrier、formal Verification 不重跑、远端交付与 cleanup

## 4. 认知与收敛

- [x] 4.1 对齐 Brief、current knowledge 与术语，完成 reconcile
- [x] 4.2 运行聚焦测试、OpenSpec strict validation 与候选验证，完成 Change convergence
