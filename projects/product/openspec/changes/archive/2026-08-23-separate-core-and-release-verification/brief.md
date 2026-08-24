# 分离日常核心 Full 与正式 Candidate/Release 重型验证

## 摘要

在唯一 Product verification registry 中新增日常 `core` profile，让 changed Full 与显式核心回归不再承担完整 Candidate/Release 重型证据，同时保持 Candidate CI、唯一 tarball 与正式发布证据链不变。

## 背景与问题

当前 `candidate` profile 同时承担普通任务触发的 Full、显式完整回归、Candidate CI 与 Release artifact 验证。即使 changed ownership 已经可信，普通执行语义变化仍会运行 package、Launcher、fresh-install、onboarding 与 release smoke 等发布级旅程，造成日常反馈过重，并模糊 `product.full-regression` 与正式 Product Candidate 的证据责任。

## 目标与非目标

- 建立 `core` 与 `candidate` 两条同源 execution profile，并证明 `core` 是 `candidate` 的真子集。
- changed Full 和 `product.full-regression` 使用 `core`；完整冻结目标显式选择 `product.candidate`。
- Candidate CI aggregate、Hosted Windows、Host Node、Launcher、唯一 tarball、publish 与 readback 继续绑定同一 Candidate source/generation。
- 本次不优化生命周期 fixture、资源协调或发布事务，也不虚报已经达到 180 秒目标。

## 受影响角色

- 普通 Product Task 与维护者：获得成本更低、范围可解释的日常 Full。
- Parent 集成与 Release 维护者：必须显式选择完整 Candidate，不把 core 结果当作发布证据。
- Candidate CI 与 publish workflow：继续消费唯一 candidate graph、aggregate 与 tarball，无第二套 producer。

## 核心流程

```text
changed path ── affected owner ──▶ affected DAG
       └── execution semantics ──▶ core profile

frozen Product target ──────────▶ product.candidate / complete candidate profile
matching release context ───────▶ existing aggregate + unique tarball + publish/readback
```

## 关键变化

- Registry 增加显式 daily-core exclusion authority 与 `core` profile。
- Planner 的 Full expansion、`test:core` 和 `product.full-regression` 统一选择 core graph。
- 新增 `product.candidate`，继续调用原有 `test:candidate`。
- Core 使用数学可行的 360 秒过渡预算；Candidate 保持 600 秒过渡预算。180 秒仍由后续成本 Contribution 收敛。

## 影响、风险与兼容性

- `product.full-regression` 的可观察范围从完整 Candidate 收窄为 core，调用者需要在需要发布级证据时改选 `product.candidate`。
- Core exclusion 如果漂移可能漏掉日常 primary evidence，因此 registry validation 与契约测试必须闭合 candidate/core/exclusion 集合。
- 发布工作流、Candidate generation、tarball identity、正式 mutation 与 readback 均不改变。

## 验收摘要

- Core plan 不包含 package、Launcher、fresh-install/onboarding 和 release smoke owners，并通过启动前预算准入。
- Candidate plan、Candidate CI shard/aggregate 与 publish artifact consumer 保持完整且唯一。
- `verification.yml` 明确区分 `product.full-regression` 与 `product.candidate`。
- changed Full、显式 core 与完整 Candidate 的 CLI/contract/planner 反例测试通过。

## 技术 Artifacts

- [proposal.md](./proposal.md)
- [design.md](./design.md)
- [product-verification-quality delta spec](./specs/product-verification-quality/spec.md)
- [tasks.md](./tasks.md)
