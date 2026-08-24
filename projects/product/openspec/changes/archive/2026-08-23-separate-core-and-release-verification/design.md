## Context

Product verification 目前只有 `fast`、changed-path plan 与 `candidate` 三个主要门禁。changed planner 一旦判定 Full，就选择完整 `candidate` profile；`product.full-regression` 也直接运行 `test:candidate`。因此日常执行语义变化会同时承担核心行为、完整生命周期、npm tarball、Launcher、package verifier 与 Release smoke，虽然 Candidate CI 和 publish workflow 已经具备唯一 artifact/aggregate 证据链，本地入口仍没有表达“核心 Full”与“完整 Candidate”的差异。

可信 ownership、Full reason 和预算准入已经由前序 Contribution 建立。本变更必须复用同一 verification registry 和 planner，不复制第二套 Candidate workflow；发布模型以已完成的 `redesign-release-workflow` canonical specs、Candidate aggregate 和唯一 tarball 为权威。

## Goals / Non-Goals

**Goals:**

- 为日常 Full 建立稳定 `core` profile，并让 changed Full 与 `product.full-regression` 使用它。
- 保持 `candidate` profile、Candidate CI shards/aggregate、唯一 tarball 和 publish consumer 完整不变。
- 提供显式完整 Product Candidate capability，供 Parent 最终集成、候选准备或独立完整核验选择。
- 让 core/candidate membership、预算和 scope reason 可由 registry/plan JSON 与契约测试审查。
- 在同一 registry 中保证 core 是 candidate 的真子集，且 Candidate/Release primary evidence 不因日常 lane 拆分而丢失或复制。

**Non-Goals:**

- 不改变 release selection、release→main、main→dev、protected transaction、tag、npm publish 或 readback 语义。
- 不在本变更优化 Task/Workspace lifecycle fixture、资源容量或并发实现；这些属于后续成本 Contribution。
- 不承诺本次立即达到 180 秒；本次先使用按当前 step 目标可行的过渡 core 预算。
- 不删除 Candidate CI shard、Hosted Windows、Host Node tuple、Launcher 或 release group verifier。

## Decisions

### 1. 在唯一 registry 中增加 `core` profile

`core` 与 `candidate` 继续是 execution profile membership，而 testing intent、changed ownership 和 focus group 保持正交。Registry 使用显式 daily-core exclusion authority：完整 Candidate 的每个 step 仍保留 `candidate`；只有明确属于 package/release artifact，或只用于 fresh-install/onboarding Candidate 的 step 不进入 `core`。Registry validation 证明 core step 必须同时属于 candidate、exclusion 必须引用真实 candidate step，避免 lane 漂移。

备选方案是按 `testing.primaryIntent` 自动推导 core membership，但这会把证据意图与执行目标合并成单一 taxonomy，且无法表达少量 Development step 只属于完整 Candidate，因此不采用。

### 2. changed Full 和显式核心 Full 共用 `core` plan

planner 的 Full reason、owner-gap 和 budget admission 行为不变；Full scope 只把执行图扩展到 `core`，不再扩展到 `candidate`。`test:core` 复用当前 Candidate orchestrator 的单 DAG、timing evidence、离线网络和精确 Node 边界，只改变 profile、evidence kind 和总预算。`product.full-regression` 指向 `test:core`，继续作为非默认、显式日常核心 Full capability。

备选方案是新增独立 core registry/runner，或让 `test:changed` 手工过滤 release group；前者复制 authority，后者会让 changed 与显式 Full 的 step 集合漂移，因此不采用。

### 3. 完整 Candidate 使用独立 capability，但不复制 producer

新增 `product.candidate` capability，仍调用原有 `test:candidate`。本地 Candidate、Candidate CI 和正式 publish 均消费同一 `candidate` membership；Candidate CI 继续生成一次 artifact、按现有 shards 形成 aggregate，publish workflow 继续按 source/generation/registry/artifact identity 下载并验证同一产物。

`product.release-artifact-set` 仍是 release group 的定点验证入口，不取代完整 Candidate，也不成为第二个 tarball producer。

### 4. 使用分 lane 的诚实过渡预算

Candidate 继续使用当前 600 秒过渡预算。Core 使用 360 秒过渡预算，并通过全局容量、依赖关键路径和资源容量下限做启动前准入。180 秒仍是 Parent 的最终 core 目标，由后续 lifecycle/fixture/resource Contribution 基于本变更交付的 core membership 收敛；若必要 primary evidence 证明不可达，Parent 最终验收前必须调整范围或预算。

## Risks / Trade-offs

- [风险] `product.full-regression` 从完整 Candidate 收窄为 core，已有调用者可能把名称理解为发布候选证明。→ 新增并文档化 `product.candidate`，契约测试同时验证两个 capability 的 invocation 与 proves。
- [风险] core exclusion 误删必要日常 primary evidence。→ core 只排除有明确 Candidate/Release 或 fresh-install 责任的 step；core 始终是 candidate 子集，changed owner 仍可定点选择 candidate-only step。
- [风险] core 仍可能超过 180 秒。→ 本变更不虚报完成，使用 360 秒过渡预算并把最终成本优化留给后续 Contribution。
- [风险] Candidate CI 与本地 Candidate membership 漂移。→ 继续由同一 registry identity、candidate profile 和 aggregate validation 约束，不修改 publish artifact consumer。

## Migration Plan

1. 增加 core membership/exclusion 与分 lane budget，先用 plan-only 测试证明 core/candidate 集合和预算可行。
2. 增加 `test:core`，切换 changed Full 与 `product.full-regression`，新增 `product.candidate`。
3. 更新契约、planner/CLI 测试与 current knowledge，验证 Candidate CI/publish workflow identity 未被复制或削弱。
4. 若回退，恢复 capability invocation 和 Full profile 选择即可；Candidate/publish authority在整个迁移中保持不变。

## Open Questions

无。后续 Contribution 将以本次冻结的 core membership 为基线处理 fixture、资源协调和 180 秒目标。
