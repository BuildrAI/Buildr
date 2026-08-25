## 1. 兼容契约与回归保护

- [x] 1.1 修订v2 parser/normalizer与Doctor文案，保留closed、full-only、`legacy-declared`兼容语义并移除有界删除承诺
- [x] 1.2 更新package static validation与v2 fixtures/tests，同时保证Skills、templates和references只创作v3

## 2. Buildr Product V3迁移

- [x] 2.1 将Product live `verification.yml`迁移为v3 `product.verification` provider与独立`product.browser-smoke`能力
- [x] 2.2 更新Product declaration contract tests，验证Task Delivery affected/full、Product Candidate、release-only和Browser选择边界

## 3. 文档与当前认知

- [x] 3.1 修订目标架构、文档索引、验证ownership与v3 reference，说明架构已实现、V2长期兼容和外部Workspace后续迁移时序
- [x] 3.2 更新Buildr Service current knowledge与glossary，统一v3-only authoring、v2 legacy reader、Doctor提示和coverage gap术语
- [x] 3.3 完成Brief与knowledge impact reconcile，确认没有把归档历史或集鲜迁移误报为本Change交付

## 4. 实现期验证与收敛准备

- [x] 4.1 运行focused contract/unit/integration/system tests，分别证明合法/非法V2与Product live V3 planner/provider/runner路径
- [x] 4.2 运行Doctor、package static checks和Product changed verification，确认执行语义变化按owner升级affected或Full且无scope外回归
- [x] 4.3 运行OpenSpec strict、convergence preflight与current knowledge inspect，修复全部归档前问题
