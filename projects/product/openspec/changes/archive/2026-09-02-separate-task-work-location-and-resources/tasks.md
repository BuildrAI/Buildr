## 1. Worktree 独立能力

- [x] 1.1 将Worktree cleanup输入、类型与provider迁到TypeScript，直接支持逐仓完整expected source/delivered ref并删除旧integrated-ref公共入口
- [x] 1.2 迁移Worktree CLI、module wiring与专属测试，证明多仓预检、部分恢复、dirty/版本/retained ref保护和幂等清理

## 2. Preview 与工作位置消费者

- [x] 2.1 将Task Preview迁到Preview自身Task/Workspace/Worktree/进程owner，移除Environment ready与resource register/release依赖
- [x] 2.2 让Task-scoped Change从Worktree evidence定位候选根，没有Worktree时安全回退retained Project根
- [x] 2.3 移除Task Overview的Environment聚合摘要并同步HTTP/Buildr Web类型与受影响任务展示

## 3. Skills、能力绑定与TypeScript

- [x] 3.1 更新Task Triage、Task Finish、Task Review、Task Worktree与OpenSpec contributions，移除普通工作对buildr.task-environment/v1的依赖
- [x] 3.2 更新capability manifest/contracts、Buildr产品入口与静态检查，验证能力图只有真实Worktree/Preview消费者
- [x] 3.3 将本Change保留且修改的Preview、Change、Worktree、module/interface/helper/fixture/tests迁到TypeScript，清除新增any与无依据类型断言

## 4. 当前认知与验证

- [x] 4.1 更新Task Closeout flow、Buildr/Buildr Web Service与Technical Architecture当前认知，并完成terminology/reconcile evidence
- [x] 4.2 运行OpenSpec strict与semantic preflight、focused Unit/Integration/System、typecheck、package/static/runtime projection及受影响Browser任务场景
