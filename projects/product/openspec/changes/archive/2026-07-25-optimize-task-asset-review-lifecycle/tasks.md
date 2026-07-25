## 1. Capability 与交付面升级

- [x] 1.1 新增 `buildr.task-asset-review/v3` contract，并把 provider、Task Finish consumer、Buildr 入口 routing 与 package/workspace manifests 原子切换到 v3
- [x] 1.2 更新 `task-asset-review`、`task-finish`、templates、产品文档和 package baseline `.gitignore`，明确 Workspace-local untracked observation 与 tracked 维护历史边界

## 2. Observation helper 生命周期

- [x] 2.1 实现 canonical Workspace root 解析和 `.buildr/asset-review/inbox/` authority，使主 checkout 与 linked task worktree 共享同一目录
- [x] 2.2 实现 v2 用户级 observation 的 identity-safe 迁移、冲突 fail-closed 与空 legacy 目录精确清理
- [x] 2.3 实现 `discarded` 终态、结构化 finalize、独立任务 handoff 校验和按 outcome 类型化 complete evidence

## 3. 验证与自举同步

- [x] 3.1 补充 helper lifecycle、linked worktree、legacy migration、gitignore、contract binding 和 Task Finish composition 测试
- [x] 3.2 运行受影响验证、OpenSpec strict 与 proposal contract guard，修复失败并记录 evidence
- [x] 3.3 从候选 Product checkout 同步 task workspace runtime，核对 `.gitignore`、v3 provider/binding 和 doctor
- [x] 3.4 冻结最终实现并运行完整 Candidate，读取并核对 timing summary
