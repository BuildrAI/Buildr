## 1. Finish diagnostics producer

- [x] 1.1 实现invocation-local diagnostics collector与owner-bound transient lifecycle，按固定phase/operation保存timeline和stdout/stderr且拒绝raw argv、cwd、env、token与越界cleanup。
- [x] 1.2 实现closed Finish body mapper与portable execution record summary，覆盖passed/blocked/failed/cancelled、run/invocation identity、脱敏前字段筛除和Store截断交接。
- [x] 1.3 增加pure Unit tests，证明closed schema、outcome mapping、portable字段、敏感值/绝对路径移除和不合法body拒绝。

## 2. Task Finish Application接线

- [x] 2.1 将调用前校验/no-op与owner mutation分离，在首次current/Carrier/target/recovery副作用前open `task-finish/finish-diagnostics` record；backpressure保持所有Finish owner facts零变化。
- [x] 2.2 为首次run与每次resume生成独立invocation record，在五阶段执行中收集invocation-local timeline/output/diagnostics，并保持固定phase与existing resume token语义。
- [x] 2.3 实现terminal seal与retained-before-diagnostics-cleanup；seal/confirmation/cleanup attention不得回滚或重放remote delivery、Environment/Carrier cleanup、Task terminal或Finish current。
- [x] 2.4 收敛`task_finish_current` phase payload为status/timing/current failure和恢复必需owner facts，移除attempt history、checks/operations/observations/output与execution record关联，同时保持target race、Delivery Adaptation、Doctor及cleanup-pending恢复。

## 3. 公开契约与runtime组合

- [x] 3.1 为`buildr.task-finish-result/v2`增加additive portable `executionRecord` operation summary，并保持`task finish inspect`为不读取records的pure Finish read model。
- [x] 3.2 更新CLI help、JSON schema registry/contract fixtures、package runtime closure与架构文档，确保checkout和npm tarball parity且不暴露SQLite、locator、Carrier路径或token。

## 4. Development与验收测试

- [x] 4.1 增加Component/Integration tests，覆盖formal passed、blocked/多次resume、failed、target race、cleanup-pending、backpressure零副作用、seal failure保留transient与retained后精确cleanup。
- [x] 4.2 增加公共CLI/System回归，覆盖invalid/no-op零record、相同Finish run多record、complete加record attention、current/inspect无record history和Delivery Carrier/recovery资源owner不变。
- [x] 4.3 运行受影响的Unit、Integration、System、contract与package parity入口，修复所有由本Change引入的失败并记录实际范围与耗时。

## 5. 当前认知与Change收敛

- [x] 5.1 更新技术架构、Buildr Service说明、CLI/JSON文档与glossary中“Finish仍待producer/diagnostics仅transient”的陈旧事实，并完成terminology与knowledge-impact reconcile。
- [x] 5.2 运行`openspec validate govern-task-finish-execution-artifacts --strict`与Change直接验收，确认checkbox、delta、实现和current knowledge一致并达到convergence readiness。
