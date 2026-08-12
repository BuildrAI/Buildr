## 1. Git 贡献与隔离 carrier

- [x] 1.1 实现不修改原 Task worktree/index/branch 的 source snapshot、原任务基线与 canonical Task Contribution identity 观察。
- [x] 1.2 在最新 Delivery Baseline 上创建 run-owned 隔离 worktree，机械应用贡献、核验应用前后 delta identity并形成 carrier commit。
- [x] 1.3 对冲突、贡献漂移、ownership/identity 无法证明实现 terminal fail-closed，并精确清理未交付 carrier。

## 2. Target race、交付与 cleanup

- [x] 2.1 收敛旧 target-race 路径：精确 resume token 只使 prepare 下游 carrier evidence失效，不改变Candidate/generation或运行formal Verification/Completion Review。
- [x] 2.2 扩展 retained Environment cleanup handoff与Git provider复核，使等价贡献交付无需改写原Task branch或伪造ancestor关系。
- [x] 2.3 交付成功后清理run-owned carrier，cleanup blocked时保留可恢复现场，并保持普通push、远端回读与其他Task隔离。

## 3. 测试与产品资产

- [x] 3.1 补充“目标前进且贡献等价可复用”测试，断言Candidate/generation/handoff不变且`formalVerificationExecutions = 0`。
- [x] 3.2 补充冲突、贡献漂移、证明不足返回Task Development，以及target-race token只重建carrier的测试。
- [x] 3.3 补充真实远端delivery/readback、原Task worktree不被改写、等价贡献Environment cleanup与隔离carrier清理测试。
- [x] 3.4 更新Task Finish Skill、capability contract/current knowledge和静态契约断言，统一中文（English）首现术语并删除冲突旧路径。
- [x] 3.5 运行相关focused/changed测试，完成current knowledge reconcile与OpenSpec严格/契约检查。
