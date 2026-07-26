## 1. 状态与 Git evidence

- [x] 1.1 将 integration push 改为显式 before/after ref transition，并覆盖自身成功 push、幂等已收敛和外部 target race
- [x] 1.2 使 invalidation、attempt completion 与 lease release 原子化，修复同 run 残留 lease 和 complete run 未结束 attempt
- [x] 1.3 增加 cleanup prepare/finalize，并在删除 task environment 前持久化 canonical completion receipt

## 2. 多阶段安全编排

- [x] 2.1 实现 identity-bound OpenSpec convergence composite handler，产品持有 receipt 和阶段恢复
- [x] 2.2 实现 formal verification composite handler，由 provider 并行调度 required capabilities并持有真实计时
- [x] 2.3 扩展 execution manifest和自动 evidence completion，使确定性步骤一次声明后连续推进

## 3. 低噪声输出与清理证据

- [x] 3.1 为 finish、doctor和verification增加 compact summary与显式 full detail模式
- [x] 3.2 为 task-owned process cleanup增加结构化 ownership evidence并排除 probe自匹配
- [x] 3.3 补齐 backward compatibility、schema和CLI architecture contract tests

## 4. 验证与真实验收

- [x] 4.1 增加成功、语义冲突、target race、lease恢复、cleanup失败和durable receipt的unit/contract/integration覆盖
- [x] 4.2 更新Brief、knowledge impact和Task Finish耗时优化任务看板
- [x] 4.3 完成proposal guard、affected验证和真实finish验收，分别报告命令、Agent编排、Token近似量、异常恢复与端到端wall-clock
