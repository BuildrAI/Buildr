## Context

Parent Plan 已保存在 Development Receipt，Planning Review 由 Task Review 独立写入，Parent Coordination read model可以动态组合两者。但 Parent Plan record 会使 Development planning gate 失效，Review record 又不能反向写 Development；当前 Agent 只能调用内部 Development driver并重构完整planning snapshot，才能把 current Review 变成保存的 gate。完成后，通用 Task Development next仍按普通实现任务返回`develop-and-observe`，没有表达“Parent 已可启动 Child”。

当前 writer 分离是正确的：Review不应写Development，Task Entry也不应建立新状态。本变更只补充受控协调动作和response-only派生事实。

## Goals / Non-Goals

**Goals:**

- 让Parent从激活稳定推进到首个Child前，Agent不调用内部driver、不重构saved planning JSON。
- 为Parent提供response-only启动就绪和eligible Contribution投影。
- 让`task next`在Parent场景返回准确的Planning Review、refresh或start-child recommendation。
- 保持Task Record、Environment、Development、Review和Parent Coordination的现有writer authority。
- 让Parent Plan输入shape和新增动作能通过CLI help/schema/example发现。

**Non-Goals:**

- 不提供跨Git、Environment、Review和Development的原子`parent start`事务。
- 不自动激活Parent、选择Environment Plan、执行Review、创建Child或reconcile Parent Plan。
- 不新增Parent lifecycle status、SQLite表、Receipt、Result、事件或进度缓存。
- 不改变普通Task的Development next判定。

## Decisions

### 1. 启动就绪保持response-only

Parent Coordination Application基于current Task Record、matching Environment、Development Parent Plan、Planning Review applicability和现有Contribution派生状态，返回：

- `status: blocked|ready`
- `checks`：task、environment、development、parentPlan、planningReview、planningGate
- 稳定排序的`blockers`
- 稳定排序的`eligibleContributions`
- 一个窄`next`

该投影不保存，不进入Parent Plan identity，也不把Child status复制到Development。

备选方案是新增`parent-ready`状态或Receipt；这会形成第二套生命周期authority，因此拒绝。

### 2. 提供受控refresh而不是公开通用Development mutation

新增`task parent refresh-planning <task-id>`。Parent Coordination Application只接受Task ID和canonical Workspace，读取saved Parent Plan、current planning snapshot与Task Review current slot，要求Review target等于Plan identity且outcome为`ready`，然后调用Task Development现有planning mutation写入最小Review引用。

调用方不提交planning JSON、Review digest或gate正文。Development仍是唯一Receipt writer，Review仍是唯一Result writer。

备选方案是让Task Review record直接更新Development；这会突破Review contract和writer边界，因此拒绝。让Agent继续调用内部driver则不可发现且容易重构陈旧snapshot，也拒绝。

### 3. Task Entry只在Parent Plan存在时读取Parent启动投影

Task Entry保持Task → Environment → Development最早硬前置。只有Development compact facts表明存在current Parent Plan时，才调用Parent Coordination的窄startup reader覆盖通用Development recommendation：

- Review缺失或stale：`planning-review`
- Review ready但Development尚未消费：`refresh-parent-planning`
- Planning gate current且存在eligible Contribution：`start-child-contribution`
- 依赖未满足或无可启动Contribution：返回精确Parent blocker/等待动作

普通Task和legacy Parent不增加额外owner read。

### 4. Contribution eligibility只由saved coordination facts派生

一个Contribution只有在未绑定Child、未交付、未superseded，且全部`dependsOn`已由matching handoff证明delivered或已明确superseded时才eligible。系统不从文件、Git、Change、Task completed或canonical specs猜测。

### 5. Skill负责编排，产品只提供窄动作与事实

`task-triage`和`task-development`记录标准Parent启动顺序、coordination-only shared Environment选择、refresh动作和Child前停止条件。Skill不得把`required: true`的Preparation Recipe自动解释为Parent必须执行；Agent仍根据Parent是否承担实现选择Recipe或`not-applicable`。

## Risks / Trade-offs

- [Task Entry额外读取Parent协调事实可能增加延迟] → 只在Development表明存在Parent Plan后调用窄reader，并保持profile可观察。
- [refresh时Review或Plan并发变化] → Application在同一次动作中重读current identity；不匹配时零写入blocked。
- [eligible判定被误认为执行授权] → 明确保持recommended和response-only，Child创建仍由Task Triage与各专业owner重验。
- [public JSON additive字段影响closed schema] → 同步更新registry、contract tests和checkout/npm parity。
- [Skill与产品surface漂移] → package verification同时覆盖builtin source、runtime projection和CLI action。

## Migration Plan

1. 先增加Domain/Application投影与refresh动作及专项测试。
2. 接入Task Entry Parent-aware next并更新public JSON/CLI registry。
3. 更新内置Skills和package映射。
4. 用fixture覆盖legacy Parent、Review缺失、Review未消费、ready、dependency blocked和candidate provenance。
5. 该变更不迁移历史Receipt；已有Parent可显式调用refresh并立即获得新投影。

## Open Questions

无。第一版不增加一键Parent启动命令；若后续仍存在跨动作重复，可在保留writer边界的前提下评估Skill runner，而不是新增跨authority事务。
