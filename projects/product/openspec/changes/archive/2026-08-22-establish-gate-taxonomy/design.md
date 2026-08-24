## Context

Buildr Core、Product Rule 与智能体优先治理路线图已经要求“只有真实结果不变量受威胁时才硬阻断”，但当前产品没有一个可供后续模块迁移共同引用的精确分类契约。现有实现中已经存在正确样例：Task Entry 将缺失 Environment Snapshot 路由为当前 required next 而非全局许可；Formal Verification preparation 明确 `doesNotBlock: unrelated-development`；Task Finish 只在 Finish 入口聚合 Development、Environment 与 Delivery gaps。与此同时，大量 `ready`、`blocked`、`required` 与 `health.ready` 仍散落在不同 Domain、Application、CLI、Skill、Doctor 和测试中。

本 Change 是架构基础 Child。它先形成规范、审计清单和代表性证明，不承担所有模块迁移，也不把审计结果物化为新的产品状态。

## Goals / Non-Goals

**Goals:**

- 给出统一、可验证的硬门禁、attention、advice 与动作局部就绪定义。
- 规定新增或保留硬门禁时必须回答的最小字段和安全降级。
- 形成有 owner、有消费动作、有后续 Contribution 去向的当前门禁审计清单。
- 用 Task Entry、Formal Verification preparation 与 Task Finish 的代表性测试证明局部阻断、无关动作继续和危险动作 fail closed 可以同时成立。
- 为 Finish、Environment、Development、Doctor 等后续 Contributions 提供迁移输入。

**Non-Goals:**

- 不新增全局 gate registry、SQLite 表、Receipt、生命周期状态或统一 gate evaluator。
- 不改变所有现有 public JSON shape，也不批量迁移所有 Application、Skill、CLI 或 Web。
- 不削弱对象 identity、授权、路径/ownership、证据真实性、共享历史和不可逆副作用的硬边界。
- 不把审计清单、测试或路线图升级为 canonical behavior authority。

## Decisions

### 1. 分类契约属于 canonical spec，审计清单属于架构迁移输入

规范定义所有后续实现必须满足的行为；审计文档只记录当前发现、owner、consumer、分类建议和后续 Contribution。这样可以让后续 Child 复用同一语言，同时避免建立第二套运行时 registry 或进度 authority。

替代方案是新增机器可写的全局 gate registry。该方案会把动态专业判断收回 Buildr，并引入新的状态、迁移和一致性问题，因此不采用。

### 2. `blocked|attention|advice` 是结果分类，`ready` 是动作局部判断

`blocked` 只表示继续一个具体动作会造成不可接受伤害；`attention` 表示结果已成立或问题可独立恢复；`advice` 只提供推荐。`ready` 不成为第四种治理级别，也不是 Workspace 或 Agent 的全局许可位，只回答“某个 consumer 的某个 action 当前是否具备必要事实”。

### 3. 硬门禁使用八字段审查模板

每项硬门禁至少记录：`action`、`consumer`、`invariant`、`harm`、`authority`、`scope`、`fallback` 与 `classification`。模板用于设计、审查和迁移，不要求所有运行时结果暴露相同 JSON，也不要求各 Domain 放弃自己的术语。

### 4. 基础证明复用真实模块，不引入未消费的通用抽象

本 Change 不新增尚无生产 consumer 的 gate Domain helper。代表性测试直接验证三个已有边界：

- Task Entry：内部 Snapshot/Plan 缺失只路由当前恢复动作；真正的 execution target identity mismatch 仍 blocked。
- Formal Verification preparation：缺少 matching preparation 只阻止正式 Verification Result，不阻止无关开发；没有 Formal Task Environment 时不扩展为通用工作许可。
- Task Finish：同时观察多模块 gaps，但只阻止 Finish run；真实 handoff、Environment 与 remote/Contribution identity 仍是硬边界。

### 5. 全面迁移由后续 Contribution 分域完成

审计清单按 owner 与消费动作把现状分配给 `finish-contract-convergence`、`task-admission-environment`、`development-evidence-flow`、`doctor-sync-isolation` 等后续 Contributions。本 Child 只修正与分类契约直接冲突且足以形成基础证明的内容。

## Risks / Trade-offs

- [风险] 文档分类可能与后续实现漂移 → 规范作为行为 authority；审计清单标注当前 tree identity/范围和后续 owner，不保存完成状态。
- [风险] 只做代表性证明会遗漏其他模块问题 → 审计清单保留未迁移项，Parent Contributions 分域交付，最终 Parent acceptance 再检查整体一致性。
- [风险] “安全降级”被误解为绕过硬边界 → 规范明确降级只能改用仍可独立核验的 authority、停止危险副作用或缩小动作范围，不能接受 claimed success。
- [风险] 统一字段被误当成统一 JSON schema → 设计明确模板是审查语言，各专业 Application 继续拥有自己的 closed Result。
