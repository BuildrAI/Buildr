## 1. Receipt v2 与迁移

- [x] 1.1 实现 planning node/snapshot、gate disposition 与可空 Content Target 的 closed domain normalization 和 identity
- [x] 1.2 实现 v1 Receipt 的确定性只读迁移、v2 serialization 与原子 repository round-trip
- [x] 1.3 补充 domain/repository 单元测试，覆盖未知字段、waiver授权、portable reference、v1兼容与写入失败恢复

## 2. Development Application 全周期动作

- [x] 2.1 增加 begin/planning internal actions，从 active Task 与 ready Environment 建立或更新早期研发事实
- [x] 2.2 调整 observe/inspect，使 Content Target 只在稳定内容节点形成，并正确投射 planning/developing/current/stale/missing
- [x] 2.3 调整 freeze/decide/handoff/carrier，对 current专业Result、not-applicable与明确waived gate执行统一门禁和失效处理
- [x] 2.4 扩展 Application integration/system journey，覆盖 proposal起步、code-only、节点更新、waiver、Candidate新generation与旧handoff不可变

## 3. Capability 与 Agent workflow

- [x] 3.1 新增`buildr.task-development@2`contract并升级provider、Task Finish consumer与workspace bindings
- [x] 3.2 更新task-development与task-triage Skills，使Development从首个正式研发动作编排到Finish handoff
- [x] 3.3 更新OpenSpec propose/update sidebar，在正式Task中登记proposal/design/planning current snapshot且不复制artifact内容
- [x] 3.4 更新Task Metadata Publication与相关contract/静态组合测试，保持exact Receipt path和专业authority边界

## 4. Local App 与当前认知

- [x] 4.1 扩展Local App Development read model/UI，展示“规划中”、planning nodes、disposition、waiver与尚未形成Content Target
- [x] 4.2 更新Local App HTTP/Web/browser-smoke测试，证明只读/no-store/fail-closed与其他Task视图不受影响
- [x] 4.3 收敛Buildr overview、service说明、glossary与Task lifecycle roadmap中的Development全周期authority和可选节点语义

## 5. 验证与投射

- [ ] 5.1 运行OpenSpec strict/proposal gate、Task Development聚焦测试、受影响consumer组合测试与`test:changed`
- [x] 5.2 同步Codex runtime并运行package/runtime projection验证与Doctor，确认v2 bindings全部ready
- [ ] 5.3 通过正式Task Verification、Completion Review和Task Development handoff交给Task Finish
