## 1. 恢复事实与状态模型

- [x] 1.1 定义版本化 convergence recovery result/receipt，绑定旧新 delta、baseline、sync plan、canonical 与 executable identities
- [x] 1.2 实现 stale receipt 分类，区分 `recoverable-stale-receipt`、`semantic-resolution-required` 与 `recovery-unprovable`
- [x] 1.3 为重复调用和中断恢复建立 checkpoint，保证已完成恢复动作可重复执行且不重复副作用

## 2. 产品持有的 OpenSpec 恢复

- [x] 2.1 核验旧 convergence receipt、deterministic sync plan、contract baseline 与当前 canonical 的完整证明链
- [x] 2.2 在任务拥有的临时 Project surface 投射旧 plan 的 `before` 文件并执行绑定 executable 的 `validate --all --strict`
- [x] 2.3 严格验证通过后原子恢复 canonical，并从真实 `pre-sync` 事实为新 delta 重建 baseline
- [x] 2.4 从恢复 checkpoint 重新执行 rehearsal、pre-sync、deterministic plan/apply、strict validation 与 post-sync
- [x] 2.5 对摘要漂移、缺失证据、语义冲突和中途失败保持整批零写入并返回结构化诊断

## 3. Task Finish 动作与恢复契约

- [x] 3.1 让 `contract-convergence` action 消费类型化恢复和结构化 convergence 分类，不再把 stale receipt 降级为通用进程错误
- [x] 3.2 为每个可预期 convergence blocker登记产品执行、provider/Agent 交接或明确不可恢复结论
- [x] 3.3 保持原 finish run 的 attempt、fingerprint、effects、evidence、timing 和 invalidation 语义

## 4. 真实流程验证

- [x] 4.1 增加真实 OpenSpec fixture：首次 `post-sync` 后修改实现和 delta，再由产品恢复并重新完成 convergence
- [x] 4.2 增加真实 Task Finish journey：typed recovery 经 action registry 重新到达正式验证边界且未重复未变 effects
- [x] 4.3 为 canonical 漂移、旧 plan 缺失、严格验证失败和重复恢复增加负向及对应恢复/终止测试
- [x] 4.4 将 journey 测试登记到受影响验证选择，确保修改 Task Finish/OpenSpec recovery 时必然执行

## 5. 产品资产与验收

- [x] 5.1 更新 Task Finish Skill、CLI/current knowledge 和任务看板，说明中文术语、恢复边界与下一动作
- [x] 5.2 运行聚焦单元/集成测试、OpenSpec contract fixtures、严格验证和受影响正式验证
- [x] 5.3 使用本 Change 自身执行真实收尾，确认 recovery 路径无需 Agent 手工编辑 canonical、baseline 或 receipt
