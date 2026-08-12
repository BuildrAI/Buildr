## 1. Development 精确身份断言

- [x] 1.1 扩展 carrier operation 输入契约，要求 handoff、Candidate、generation 与 Content Target 四项冻结 identity
- [x] 1.2 让 Task Development Application 只对精确匹配的 current handoff 返回 equivalent，并返回类型化 mismatch
- [x] 1.3 增加 current、历史 handoff、缺字段和 Content Target 漂移的 Application/contract 测试

## 2. Finish 阶段身份围栏

- [x] 2.1 统一 Product executor 的 preflight、prepare、verify、deliver 与 resume currentness 检查，移除历史 handoff 回查
- [x] 2.2 阻止旧 run 在 handoff 漂移后重新观察新 Task source 或复用旧阶段输出
- [x] 2.3 增加历史 A/current B、prepare 后漂移和 deliver 零 push 的系统测试

## 3. Current run 冲突与安全失效

- [x] 3.1 为 run factory 增加 normalized identity digest 冲突保护，相同 identity 仅幂等复用
- [x] 3.2 按持久化副作用事实区分 preflight-only superseded 与必须保留现场的 identity conflict
- [x] 3.3 让显式 run 恢复执行同一 Development assertion，并要求新 handoff 重新冻结 commit message
- [x] 3.4 覆盖无副作用旧 run、已有 carrier/remote/cleanup facts、显式旧 run 和 retained Doctor 同 identity 恢复

## 4. Capability 与当前认知收敛

- [x] 4.1 同步 `buildr.task-development@2`、`buildr.task-finish/v1` capability contract、随包 Skills 与全部已知 consumer
- [x] 4.2 更新 Change Brief、Task Finish 技术架构、流程与 Buildr Service 当前认知
- [x] 4.3 核对 Task Finish、Development Handoff、Delivery Carrier 与 Current Run 既有术语，无长期术语变化时记录 not-applicable

## 5. 验证与 Change 收敛

- [x] 5.1 运行 Task Development carrier 与 Task Finish identity/resume 的 focused tests
- [x] 5.2 运行 affected assurance、OpenSpec strict validation、capability/Skill sync 检查与 Doctor
- [x] 5.3 检查 knowledge impact 无 unresolved、完成 checklist，并通过唯一 convergence writer 同步 canonical specs 与归档 Change
