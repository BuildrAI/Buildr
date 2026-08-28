## 1. 统一收尾入口

- [x] 1.1 重写产品源 `task-finish` Skill，将匹配 Task 与无 Task 直接 Git 收尾表达为两个互斥分支，并收敛术语、完成标准和安全边界
- [x] 1.2 更新产品入口路由、manifest 描述与随包资产，保持 `buildr.task-finish/v1` 正式保证和 `buildr.git-operations/v1` 单操作边界不变

## 2. 验证与当前认知

- [x] 2.1 更新静态、package/runtime parity 与行为测试，覆盖统一 description、Task 分支、直接 Git 分支和证据隔离
- [x] 2.2 更新 Change Brief、影响 sidecar 与真实受影响的当前认知，完成术语核对
- [x] 2.3 运行 OpenSpec strict/preflight、技能与能力专项验证及受影响产品验证，修复本次变更导致的问题
