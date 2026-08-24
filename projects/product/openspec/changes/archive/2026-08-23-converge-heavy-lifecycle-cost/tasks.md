## 1. 基线与证据责任

- [x] 1.1 在实现代码变化前取得一轮通过的纯 52-step Core timing 基线，保存 wall-clock、累计 step work、最慢 owner、Context setup 和有效并行度。
- [x] 1.2 审计 Task/Workspace 最慢 owners 的公共可观察结果、primary evidence、fixture、真实边界和重复准备，形成保留、迁移或残余结论。

## 2. Buildr Test Context

- [x] 2.1 在 `test/context/` 实现 runner-independent Context/Pool/Sandbox Lease contract、marker、tree identity、containment、污染检测、清理和 timing。
- [x] 2.2 实现 Context provider registry 与 `node:test` 薄 adapter，并用 Unit/Integration 反例覆盖未知 provider、seed 污染、sandbox alias、重复 release和cleanup失败。
- [x] 2.3 把 Task lifecycle immutable seed迁移为Context provider，保留旧 helper兼容入口，并让outer plan、System runner和直接单文件执行共享同一生命周期语义。

## 3. 层级并发与资源

- [x] 3.1 扩展verification registry/planner字段，闭合校验contexts、isolation/reset、parallel safety和数值resource demand。
- [x] 3.2 让DAG scheduler按execution profile容量产生step grant，executor与inner runner只消费grant，并记录demand/grant/queue/resource wait。
- [x] 3.3 为Task、Git、Workspace、Process重型owners校准资源声明，补齐Full/affected跨执行等待、释放、取消和失败后重跑证据。

## 4. Task领域迁移

- [x] 4.1 把可由同进程充分证明的Task Domain/Application case收敛到Component context，保留真实SQLite/CLI/Git Integration owner。
- [x] 4.2 去除Task Development、Execution Record、Finish与System lifecycle中已转移主证据的重复初始化或happy path，保留完整Finish、自举、初始化/cleanup和并发Acceptance黄金旅程。
- [x] 4.3 用contract与代表changed paths证明Core/Candidate文件union、唯一primary owner、Release exclusions和失败隔离没有退化。

## 5. 验证框架文档与当前认知

- [x] 5.1 编写 `docs/verification-framework.md`，完整说明验证控制面、执行面、测试边界、Context生命周期、并行/资源、evidence owner、Core/Candidate/Release和测试接入流程。
- [x] 5.2 更新verification ownership入口、Buildr Service/technical knowledge和canonical glossary，使文档术语、目录、字段与最终实现一致。
- [x] 5.3 完成Change Brief、knowledge impact与最终current knowledge reconcile，确保文档没有超前声明未实现能力。

## 6. 实现验证与收敛

- [x] 6.1 运行Context、registry、scheduler、Task边界contract和迁移owner的focused验证，证明关键反例会失败。
- [x] 6.2 取得关键owner至少两轮focused成功、纯Core至少三轮成功及一次Core/affected竞争压力，报告中位数、波动、累计work、隔离、cleanup与残余长尾。
- [x] 6.3 验证Candidate 66-step membership、唯一tarball、Hosted Windows/Host Node/Launcher/npm/release readback责任未削弱，并在必要时形成诚实预算residual。
- [x] 6.4 完成strict validation、deterministic convergence preflight与archive readiness；正式convergence/archive在全部Change-owned任务完成后由单一事务执行。
