## 1. 恢复资格与证据

- [x] 1.1 提取并实现旧失败 run 的 closed recovery eligibility，拒绝 repository set 漂移及任何 lease、delivery、retained、completion、cleanup、resume 或后续 phase 事实
- [x] 1.2 为 current Handoff 建立独立的内存 reconciliation run，确保 identity 冲突时先完成全 repository 远端包含证明且不写旧 current row

## 2. Carrier 清理与终态

- [x] 2.1 复用 run-owned carrier cleanup primitive，返回逐 repository cleanup 状态并支持部分清理后的幂等重试
- [x] 2.2 在全部 containment 与 cleanup 通过后保存 current Handoff 的 terminal reconciliation，并记录 bounded superseded run recovery 摘要

## 3. 测试与回归

- [x] 3.1 增加成功恢复和 current Handoff 未被远端包含时零 cleanup/零持久化的集成测试
- [x] 3.2 增加旧 run 下游副作用、repository set 漂移、carrier ownership/cleanup 失败及部分 cleanup 重试测试
- [x] 3.3 运行 Finish focused tests、affected verification 与必要的静态检查，确认普通 `task finish run` identity conflict 行为未变化

## 4. 当前认知与收敛准备

- [x] 4.1 评估并收敛 Brief/current knowledge 与术语影响，只更新本 Change 真正影响的入口
- [x] 4.2 严格验证 Change 并完成 deterministic convergence/archive readiness
