## 1. 稳定投影与 Runner 契约

- [x] 1.1 在 self-bootstrap repository projection 中保留冻结 `leaseTargetIdentity`，并覆盖 v3 exact 与 legacy v2 singleton 投影测试
- [x] 1.2 让 bundled closeout plan 和 target lease command 只使用投影的 exact identity，并校验 driver resolved identity

## 2. SQLite Lease Authority

- [x] 2.1 在 matching current/terminal owner transaction 内实现 exact identity 与唯一 legacy logical target 解析，拒绝零匹配和多匹配
- [x] 2.2 为内部 driver 增加 Task/run-aware acquire、refresh、release结果，保持旧 outward identity兼容并返回 resolved identity

## 3. 回归验证

- [x] 3.1 增加 terminal v3 SQLite row、稳定投影、bundled runner 与真实 target lease driver 的集成回归
- [x] 3.2 覆盖唯一 legacy 恢复、同逻辑 target 多仓歧义、错误 Workspace/Task/run/repository identity 与 token fencing拒绝矩阵
- [x] 3.3 运行受影响 unit/integration/contract 测试与 verification registry 选择器，修复所有回归

## 4. 当前认知与收敛准备

- [x] 4.1 将技术架构、Buildr Service 与 OpenSpec Change 流程中的 self-bootstrap lease 描述对齐 exact repository identity 和有界历史兼容
- [x] 4.2 核对 Brief、knowledge impact、术语与最终实现一致，并通过 OpenSpec strict validation 与 convergence readiness检查
