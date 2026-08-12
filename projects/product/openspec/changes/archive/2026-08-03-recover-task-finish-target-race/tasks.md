## 1. Target-race 恢复执行器

- [x] 1.1 仅对持有当前产品 token 的 `deliver + task-finish.target-race` run 失效旧 frozen candidate 及 prepare 下游状态。
- [x] 1.2 让恢复后的既有 prepare/verify/deliver 链路重新生成候选、建立匹配 Result 并保留非 target-race 的最早阶段恢复语义。

## 2. 回归证明

- [x] 2.1 更新 Task Finish run 集成测试，证明 target-race token 恢复重跑 prepare、verify、deliver、cleanup，且不会复用旧候选输出。
- [x] 2.2 保留无 token 拒绝与 cleanup/其他暂态阻塞只重跑最早 blocked phase 的覆盖。

## 3. 当前认知与验证

- [x] 3.1 在实现完成后收敛 Buildr Service 与 Change lifecycle 的 target-race 恢复说明，并更新 Brief/knowledge impact evidence。
- [x] 3.2 运行受影响测试、OpenSpec strict validation 与 proposal contract check；以正式 Candidate 验证交付候选。
