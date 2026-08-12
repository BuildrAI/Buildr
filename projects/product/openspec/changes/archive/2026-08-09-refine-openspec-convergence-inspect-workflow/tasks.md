## 1. 收敛事务与CLI

- [x] 1.1 实现`OpenSpec Convergence Inspect`只读Application结果，覆盖未开始、before、expected、unknown和archived not-applicable
- [x] 1.2 让`OpenSpec Converge`在成功归档后释放本次事务Receipt，并支持归档终态幂等重试
- [x] 1.3 用`openspec convergence inspect`与`buildr.openspec-convergence-inspect/v1`替换旧`openspec audit`命令和JSON注册
- [x] 1.4 将Product candidate的canonical变更门禁从tracked Receipt切换为Archived Change delta与canonical事实关联

## 2. Agent资产与当前认知

- [x] 2.1 更新OpenSpec Contract Guard、workflow contributions、package投射源和静态契约，禁止正常Converge后或环境清理后Inspect
- [x] 2.2 同步CLI reference、JSON contracts、release/limitation说明、产品入口和OpenSpec lifecycle flow
- [x] 2.3 维护Project glossary与必要的technical architecture说明，统一Convergence、Converge、Convergence Inspect和Convergence Receipt边界

## 3. 开发测试

- [x] 3.1 增加Convergence transaction/Inspect的Unit与Integration回归测试，证明只读、终态释放和失败恢复
- [x] 3.2 更新OpenSpec fixture和candidate contract audit测试，证明无tracked Receipt的正常归档候选仍可验证
- [x] 3.3 更新CLI catalog、public JSON、package/runtime parity和旧入口unknown-command测试

## 4. Change收敛准备

- [x] 4.1 完成Brief、knowledge impact、术语与最终实现的current knowledge reconcile
- [x] 4.2 运行OpenSpec strict validation和受影响开发验证，确认无当前`openspec audit`消费者、无新持久化authority且全部Change任务闭合
