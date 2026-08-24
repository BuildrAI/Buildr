## 1. Carrier 可丢弃性与共享资格

- [x] 1.1 在 Product 首次返回 prepare blocked/failed carrier 时持久化不可刷新的 owner、topology、HEAD、index、worktree 与 untracked 内容证明
- [x] 1.2 扩展共享恢复资格，独立表达 remote reconciliation retirement 与已知Task Contribution漂移下的local stale-run rollover，并覆盖其他resume、历史缺失、内容漂移、lease/side-effect 与多 repository 反例

## 2. 显式安全换代

- [x] 2.1 实现精确、幂等的旧 carrier cleanup 与 SQLite current-row fenced replacement，保留旧 Execution Record和有界 superseded 关联
- [x] 2.2 增加 `task finish rollover` Application/CLI，限定 recovery token 与语义 commit message 输入，并保持普通 `run` 和 `reconcile` 既有语义

## 3. Readiness 与代表性旅程

- [x] 3.1 扩展 Finish current facts 与 Task Entry Snapshot，投影 recovery disposition、qualification identity、typed blockers 和 `finish-rollover` capability，不执行策略或远端探测
- [x] 3.2 补充原 worktree 漂移后新 Candidate 安全换代、carrier 被修改、部分 cleanup、中断重试、current-row竞争及正常 resume/reconcile 兼容旅程

## 4. 当前认知与收敛

- [x] 4.1 对齐 Brief、technical architecture、Buildr Service 边界、随包 Task Finish Skill/contract 与 knowledge impact evidence；术语保持现有 Task Finish/Delivery Carrier/Delivery Reconciliation 边界
- [x] 4.2 完成实现期 focused/affected 反馈、OpenSpec strict validation 与 canonical convergence readiness
