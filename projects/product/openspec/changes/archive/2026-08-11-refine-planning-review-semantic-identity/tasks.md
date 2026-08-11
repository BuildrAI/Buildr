## 1. 语义身份核心

- [x] 1.1 实现 closed Markdown/任务/spec 规范化与确定性 semantic projection domain
- [x] 1.2 实现 Task Planning Identity Application，复用 Task Record 与 Task-scoped Change Resolver 并返回 resolved/blocked 结果
- [x] 1.3 注册 runtime composition 与只读 internal driver，不新增公共 CLI 或持久化 store

## 2. Consumer 与 package 接线

- [x] 2.1 更新 task-development、task-review 与 OpenSpec propose/update/apply/contract-guard Skill 指引，统一消费 resolver
- [x] 2.2 更新 Buildr package static validation 与交付资产约束，拒绝旧手工摘要指引和接线缺失

## 3. 测试与兼容性

- [x] 3.1 增加 Unit 测试，覆盖语义变化、checkbox/path/time 排除与 unsupported structure fail-closed
- [x] 3.2 增加 Application/Integration 测试，覆盖 active/archive 等价、多 Change 排序、missing artifact 与零写入
- [x] 3.3 增加 package contract 测试，覆盖 driver 与所有 consumer assets
- [x] 3.4 运行聚焦测试与 OpenSpec strict validation，修复所有直接回归

## 4. 当前认知与归档准备

- [x] 4.1 完成 Brief、technical architecture、OpenSpec flow 与术语影响收敛
- [x] 4.2 核对 proposal/design/spec/tasks、实现和测试一致，完成 deterministic convergence 前置检查
