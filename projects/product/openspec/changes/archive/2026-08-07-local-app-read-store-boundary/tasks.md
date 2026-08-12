## 1. Structured Store boundary

- [x] 1.1 收窄 `workspace-sqlite` 只读 assertion，使已解析 root 的 read-only operation 不调用 checkout observer，同时保留 writable provenance guard
- [x] 1.2 检查 candidate/validation root-scoped store 的创建、读取和 canonical writer 拒绝路径，确保不引入第二个共享 structured store

## 2. Verification evidence

- [x] 2.1 更新 workspace SQLite integration tests，覆盖只读无 Git 调用、writable 仍有 provenance 保护和 candidate store 隔离
- [x] 2.2 更新 Local App Task system tests，覆盖已登记 canonical root 的读取无 Git/worktree provenance 依赖
- [x] 2.3 运行受影响的 unit/integration/system/browser smoke tests，确认空 store read remains side-effect free

## 3. Knowledge and delivery readiness

- [x] 3.1 创建或更新 Change Brief 与 `.buildr/knowledge-impact.yml`，将 Structured Store 与 Local App read boundary 标为已收敛
- [x] 3.2 通过 Task Development observe、Verification policy/result、Completion Review 和 handoff，形成可 Finish 的 current Content Target
