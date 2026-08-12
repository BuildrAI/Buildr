## 1. 契约、基线与Planning Review

- [x] 1.1 完成P0.5 authority audit、identity graph、通用Workspace边界与current knowledge/terminology影响评估
- [x] 1.2 建立OpenSpec contract baseline，运行proposal stage strict checks并修正全部契约诊断
- [x] 1.3 对proposal/design/specs/tasks执行Planning Review并通过Task Review Application记录current Result

## 2. Development Domain与Persistence

- [x] 2.1 实现closed Development Receipt、Content Target、policy、Candidate/generation、gate、decision与handoff纯Domain normalization/identity/invalidation
- [x] 2.2 实现精确Development repository路径、唯一reader/writer与原子整值替换/rollback
- [x] 2.3 实现不预设Git/Node/OpenSpec的Content Target observer port与registered-source/filesystem adapters

## 3. Development Application与专业Application协作

- [x] 3.1 实现observe context/target、record policy、freeze、decide、handoff、carrier equivalence与inspect actions
- [x] 3.2 让Development只通过Task Record/Environment/Review/Verification Application/read models消费专业事实
- [x] 3.3 实现Content Target、Task context、policy/declaration/gate漂移的fail-closed invalidation与generation幂等

## 4. Skill、Capability与Runtime投射

- [x] 4.1 新增`buildr.task-development@1` contract、`task-development` bundled Skill与内部Application driver，不新增公共CLI/Local App surface
- [x] 4.2 更新package manifests、bindings、static validation、Buildr/task-triage/Review/Verification/Finish Skills的单一authority路由
- [x] 4.3 删除Finish的Review/Verification/current knowledge/task-asset依赖并让Finishrequired消费Development handoff

## 5. Verification与Finish迁移

- [x] 5.1 将Task Verification target语义迁移为stable Content Target，并删除Finish consumer与Candidate术语
- [x] 5.2 将Finish preflight/prepare/verify迁移为handoff、内容等价carrier与formalVerificationExecutions=0
- [x] 5.3 删除Finish Change convergence/archive、runtime content mutation、Candidate writer/generation与formal Verification executor路径，不保留旧schema/route/semantics
- [x] 5.4 保留并验证普通delivery、retained sync/install/doctor与Task Environment cleanup adapter边界

## 6. 分层测试与通用Workspace验收

- [x] 6.1 增加Domain identity/policy/applicability Unit tests与Application/repository Component tests
- [x] 6.2 增加files+sibling records+registry+Review/Verification/Development Applications Integration tests
- [x] 6.3 增加无Git、无OpenSpec、非Product/Service且自带verification.yml的code-only System journey
- [x] 6.4 更新现有Task Finish/Verification/contract/system fixtures并证明没有第二registry、writer或测试framework

## 7. Current knowledge与Change收敛

- [x] 7.1 完成delta specs、Roadmap、glossary、overview、product/technical architecture、flow、service/product docs与verification ownership；canonical sync由单一convergence事务完成
- [x] 7.2 完成knowledge reconcile、terminology alignment、strict/contract prechecks，并使Change具备单一convergence事务归档条件

以下是Change归档后的Task lifecycle验收，不作为归档前artifact completion checkbox；由Development Receipt、Verification/Review Result、Finish run/result与Task Record分别记录：

- 运行focused Quick、Task-affected、required Task Verification与完整Product Candidate并记录稳定Content Target Result。
- 使用新Development authority生成本 Change Candidate、Completion Review、proceed decision与Finish handoff。
- 通过窄Task Finish adapter完成carrier交付、retained sync/install/doctor与Environment cleanup，证明P0.5自举生效。
