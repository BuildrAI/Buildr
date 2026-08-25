## 1. Release reconciliation owner

- [x] 1.1 用只读 `reconcile-dev` 实现替换 Publication 后 main→dev merge，核验 Publication、frozen selection、正式 release/main refs 与 current dev provenance，并保留无写入兼容入口
- [x] 1.2 更新 release lifecycle、closeout 与 CLI 输出/恢复状态，使 matching dev provenance reconciliation 成为 closeout 前置且不再消费 dev merge policy

## 2. Release workflow guidance

- [x] 2.1 更新 canonical `buildr-release` Skill 源与发布 checklist，明确版本材料和候选修复先由基于 dev 的 support Task 交付，再以 `cherry-pick -x` 进入既有 release
- [x] 2.2 更新 Buildr Service、开源发布流程与 glossary，并把 terminology/current knowledge reconciliation 结果写回 knowledge-impact evidence

## 3. Verification and convergence readiness

- [x] 3.1 更新 focused integration、lifecycle、contract 与静态治理测试，覆盖线性 dev、dev 后续提交、provenance/main/release 漂移、兼容别名及零 Git 写入
- [x] 3.2 运行 focused release tests、package/static validation、OpenSpec strict validation与current knowledge inspect，修复本 Change 直接产生的反馈并确认全部 checklist 可在archive前闭合
