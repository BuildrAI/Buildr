## 1. 恢复证据模型

- [x] 1.1 增加 terminal contribution reconciliation Domain value、SQLite migration 与 append-only Persistence，覆盖identity、幂等、冲突和rollback。
- [x] 1.2 在 Task Development Application 中实现严格恢复校验，复用Parent Plan、Contribution Handoff、immutable handoff、terminal Finish association和archived Change事实。

## 2. 协调入口与投影

- [x] 2.1 增加 task parent reconcile-child-delivery CLI discovery与执行入口，并在Parent Coordination固定查询/read model中消费原生或恢复proof。
- [x] 2.2 增加Domain、Application、Repository、CLI contract与Parent Coordination integration测试，覆盖两个历史缺口形态及全部fail-closed场景。

## 3. Agent与长期知识

- [x] 3.1 同步buildr.task-development/v2 contract、Task Development / Buildr Skill、父子任务架构文档与Buildr Service current knowledge，明确恢复不是normal Child替代路径。
- [x] 3.2 运行strict OpenSpec、受影响Service测试、静态契约检查与完整Product验证反馈，修复发现的问题并完成Change convergence准备。
