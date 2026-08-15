## Context

Formal Task 的 Task Record、Environment Receipt、Development Receipt 及后续专业 Result 都已有独立 authority。当前缺口不是缺少状态，而是缺少一个面向 Agent 的窄入口：Agent 必须依次发现并读取多个命令、Skill 与完整结果，才能回答“当前在哪个执行根、应由哪个 writer 调用哪个专业能力、下一步是什么”。这使实际只需数秒的 Environment 准备之前出现长时间串行上下文装配。

本次任务用 action-local loading 复测，Task 创建到 Environment ready 为 39.623 秒，到首个 Development 事实为 63.368 秒；这说明无需删除 lifecycle authority，也能显著缩短启动。但仅依赖 Agent 自律不能为其他会话稳定提供相同效率，因此需要产品级 compact projection。

约束如下：

- 新入口不能成为第二个 workflow engine、writer 或持久化状态源。
- Environment 缺失时不能为了预测未来而读取 Review、Verification 或 Finish。
- Development 的 next 判定不能出现第二套分支逻辑。
- retained controller 与 candidate CLI 的 writer provenance 必须在命令构造前明确。
- 用户仍可调整非强制研发顺序；只有 authority 前置条件和恢复条件可以表达为 required。

## Goals / Non-Goals

**Goals:**

- 用一次只读调用返回 Formal Task 当前最小 identity、Environment 执行投影、Development compact current facts 和唯一 next action。
- 区分 `required` 与 `recommended`，让硬安全边界 fail closed，同时保留用户对建议流程的调整空间。
- 只投影当前 next action 的 capability contract 与 selected provider identity，不向 Agent 注入完整 capability graph。
- 通过 response-only profile 提供 wall-clock 和 owner read 调用事实，支持复盘但不影响任何生命周期结论。
- 保持既有 Task、Environment、Development、Review、Verification、Execution Record 与 Finish 行为兼容。

**Non-Goals:**

- 不自动执行 next action，不实现完整 lifecycle DAG 或通用编排语言。
- 不持久化 Agent source map、Skill 正文读取历史、prompt、Context Window、隐藏推理或估算 token。
- 不改变既有 Receipt/Result/store schema，不增加 migration。
- 不把 2–4 分钟参考目标编码为 gate、timeout、自动 pass/fail 或自动推进条件。
- 不解决 Component/member integrity、propose checklist lifecycle、Finish 大 JSON 往返或 Retrospective 原始事件恢复等相邻问题。

## Decisions

### 1. 新增只读 Task Entry Snapshot，而不扩展 Task Overview

新增 `buildr task next <task-id> --json`，由 Application 顺序组合 Task Record inspect、Task Environment execution resolver 和 Task Development compact inspect。返回 closed `buildr.task-entry-snapshot/v1`，仅包含当前 identity、applicability、execution、blockers、effects、diagnostic、唯一 `next`，以及可选 response-only profile。

现有 Task Overview 面向 Web 的跨生命周期历史展示，并明确不探测 live Environment；扩展它会混淆读模型职责，也会把完整 downstream 状态重新带回启动入口，因此不采用。

### 2. 按最早硬前置短路 owner reads

入口先读取 Task Record。Task 不存在、terminal 或不是 active 时直接返回 blocked。随后只调用 Environment owner 的 execution resolver；Environment 不 ready 时立即返回 required Environment 恢复动作，不读取 Development 或任何下游专业 Result。Environment ready 后才读取保存的 Development compact applicability。

显式 `--execution-target` 仅作为 matching Environment execution root 的核验输入；不一致时 fail closed，不扫描、猜测或切换其他 worktree。

### 3. Development typed next 与 legacy guidance 同源

将现有 Development `recommendedNextActions` 重构为一个 typed next 判定函数，再由它渲染 legacy `nextActions` 字符串。Task Entry Snapshot 直接消费 typed `next`，避免复制阶段条件。既有 Development operation schema 与 `nextActions` 保持兼容；typed `next` 是 additive response 字段。

缺少 Environment/Development、identity 恢复等 authority 前置使用 `mode: required`。正常研发推进使用 `mode: recommended`；它表达产品当前建议，不声明唯一合法用户路径。真正执行动作时仍由对应 owner 重新验证 currentness 并 fail closed。

### 4. capability routing 只投影一个当前 identity

Snapshot 将 typed next 的 capability/version 交给现有 capability resolver，并只返回该 identity 的 contract digest/path、binding provenance、readiness 与 selected provider id/runtime path。内部可以复用现有 graph 解析事实，但响应不得包含 contracts、consumers、candidates 或完整 dependency graph。

多 Project binding 存在冲突或 provider 不 ready 时，next 变为 required recovery，并提供精确 owner；不靠关键词或隐藏 Agent 推理判断。Snapshot 不新增 capability contract 或 binding version，也不改变 provides/requires 图。

### 5. writer route 来自 matching Environment Receipt

Environment ready 时，Snapshot 返回 resolver 已证明的 execution roots、retained `controllerInvocation` 与 candidate `cliInvocation`。所有 canonical Workspace writer 的 next command 使用 retained controller；candidate 只用于任务执行根内允许的执行。调用方显式 target 与 receipt 不一致时零写入失败，不搜索替代 checkout。

### 6. profile 只统计本次响应内可观察事实

只有 `--profile` 时返回总 wall-clock、各 owner read 的调用次数和耗时，以及本次 blocked/retry facts。计时使用单次调用内的 monotonic clock；不持久化、不跨调用累计，也不进入 Result、gate、Candidate、Task status 或 next 选择。

### 7. 灵活性通过模式与 owner 边界保留

Snapshot 不接受“跳到任意阶段”的流程配置，因为这会把产品变成第二套状态机。用户可忽略或调整 `recommended`，并通过现有专业命令提供显式 target、waiver、risk decision 或其他合法输入；`required` 只覆盖无法安全绕过的 authority 前置和恢复动作。需要长期改变默认 provider 或 capability binding 时继续使用 capability adaptation。

## Risks / Trade-offs

- [组合入口演变成第二个 workflow engine] → 只返回一个即时 next，不自动执行、不保存当前位置、不枚举完整后续 DAG。
- [compact applicability 可能晚于 live repository 事实] → 响应标明保存的 observedAt；实际专业 owner 在写入前仍重验 currentness，Snapshot 不声称最终授权。
- [capability graph 内部解析仍有成本] → 只在已经确定 next capability 后解析，并只输出一个 route；后续可独立优化 targeted resolver，不把它升级为本 Change 的平台重构。
- [用户把 recommended 当作 gate] → schema 与文档明确 recommended 可调整，只有 required 表示当前安全前置。
- [多 Project provider binding 不一致] → fail closed 并要求拆分动作或显式适配，不静默选择 provider。
- [CLI 参数增加认知负担] → 日常入口只需 task id 和 canonical Workspace；`--execution-target` 与 `--profile` 均为按需选项。

## Migration Plan

无需数据 migration。新 Application、CLI route、public JSON schema 与 guidance 均为 additive；既有 Receipt、Result 与 SQLite authority 不变。回滚可删除新增入口并回退 Development additive typed next，历史数据无需转换。

## Open Questions

无。
