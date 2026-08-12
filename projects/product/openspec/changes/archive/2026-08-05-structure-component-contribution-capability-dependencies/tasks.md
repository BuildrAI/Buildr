## 1. Component dependency contribution

- [x] 1.1 扩展 Component definition parser、renderer和validator，支持严格的`contributions.skillDependencies`对象
- [x] 1.2 在runtime Skill resolution中合并base与Component dependencies，并保留确定性required优先和provenance
- [x] 1.3 更新Component package reconcile/check与静态验证，覆盖target、字段、重复、冲突及生命周期一致性

## 2. OpenSpec consumer收敛

- [x] 2.1 将OpenSpec explore/propose/update/apply依赖迁入Component definition并移除package descriptor重复声明
- [x] 2.2 移除`task-triage#change-ready`，在apply prepend接入apply-ready、strict validation和proposal check
- [x] 2.3 为sync/archive增加拒绝旁路并转交`buildr openspec converge`的prepend contributions
- [x] 2.4 更新Component integrity、package workspace targets和相关静态契约

## 3. 验证与当前认知

- [x] 3.1 增加Component install/update/uninstall与runtime capability graph集成测试
- [x] 3.2 更新OpenSpec workflow、package parity及无Markdown推断的contract tests
- [x] 3.3 运行changed/affected验证并修复全部回归
- [x] 3.4 收敛Brief、Component/capability/current flow知识与术语evidence
