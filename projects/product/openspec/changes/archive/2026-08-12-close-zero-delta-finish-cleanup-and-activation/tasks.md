## 1. 零差异 cleanup proof

- [x] 1.1 提取 deliver 与 retained cleanup 共用的 Agent-reviewed zero-delta containment 观察器，确定性复核 carrier ownership、baseline、空 actual delta、target ref 与 proof identity。
- [x] 1.2 保持普通 already-contained changed-path containment 不变，并增加 zero-delta 正常、篡改、漂移与普通路径回归测试。

## 2. 多待激活 self-bootstrap

- [x] 2.1 将 frozen `baseRef` 与动态 `activationBaseRef` 分离，验证无 merge 的 Buildr-owned descendant provenance chain、clean tree 与 remote 对齐。
- [x] 2.2 让 sync successor 以 activation base 为直接 parent，并保持当前 run/plan successor 的未 push、已 push与重复执行恢复语义。
- [x] 2.3 增加多个 Formal Finish/self-bootstrap successor 顺序激活、无 delta 继续 finalize，以及 merge、未知 trailer、remote drift 等 fail-closed 测试。

## 3. 真实消费者与当前认知

- [x] 3.1 增加至少一条穿过真实 retained cleanup 子进程/consumer 的零差异 journey，证明 Environment 与 carrier owner cleanup，不以 mock 冒充最终验收。
- [x] 3.2 收敛 Brief、Task Finish 技术架构、Buildr Service、OpenSpec Change 生命周期与 self-bootstrap Skill 指引；术语核对为 aligned 或明确处理冲突。

## 4. 直接反馈与收敛

- [x] 4.1 运行 OpenSpec strict validation、相关 Unit/Integration/System/Contract 直接反馈并修复失败。
- [x] 4.2 完成 knowledge reconcile/inspect 与 deterministic OpenSpec convergence/archive 前置检查，确认归档后 Planning Identity 的核对方法。
