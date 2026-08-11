## Context

Task Retrospective Application 已提供 `inspect|record|handle`，其中 `handle` 使用 `expectedCurrentDigest` 防止陈旧覆盖。Local App 只有在人明确点击“标记已处理”“无需处理”或“重新打开”并提交说明后才调用 `handle`；Agent provider 当前却把“用户要求处理已有复盘”直接解释为可以完成当前事实重判、Task 关系写入和 disposition mutation，缺少与 UI 等价的明确选择。

Buildr 无法从 Application 或 CLI 参数判断一段对话是否构成用户授权。增加 `--user-approved` 一类由 Agent 自行传入的 flag 只会制造虚假保证，因此授权边界必须由 Agent 可读取、可测试、可投射的 Skill 与 capability contract 约束。

## Goals / Non-Goals

**Goals:**

- 把 Agent 的 current 复盘处理拆成只读讨论阶段和明确授权后的写入阶段。
- 对 `handled`、`no-action`、`pending` 以及 Task 创建/关联分别暴露准确 effects，让用户可以一次明确授权完整方案。
- 保留用户直接给出完整动作时的连续执行能力，避免无意义的重复确认。
- 用 canonical spec、v2 contract、provider Skill 和 package contract test 共同防止行为回退。

**Non-Goals:**

- 不改变 SQLite schema、Application、repository、driver、HTTP 或 JSON contract。
- 不引入 approval store、授权 token、对话日志或新 lifecycle gate。
- 不改变 Local App 已有显式按钮与说明交互。
- 不改变复盘报告生成、Token 证据边界或 Task Record 来源关系模型。

## Decisions

### 1. 宽泛处理请求只授权只读阶段

“处理、检查、看看、分析复盘”等未指定 mutation 的表达，只允许 `inspect`、读取 current facts、重判方向和形成拟处置方案。Agent 必须在对话中展示拟 disposition、理由、将创建或关联的 Task IDs 及关系 effects，然后停止写入并等待用户决定。

这比从“处理”推断 `no-action` 更窄，也与“先审查、再授权”的 Buildr 通用边界一致。

### 2. 明确动作本身可以构成授权

用户已经直接指定 disposition、理由与适用 Task effects，例如“把这个复盘标记为无需处理，理由是……”，或明确接受 Agent 刚展示且未变化的完整方案时，provider 可以直接执行，不再机械要求第二次确认。

授权只覆盖已展示的精确 effects。若重新 inspect 后 current digest、拟 disposition、理由或 Task effects 发生实质变化，旧授权失效，必须重新展示并确认。

### 3. 保持 Application 为机械 authority

`handle` 继续只校验 terminal Task、合法 disposition、非空 note 与 current digest。Application 不读取对话、不接受自报授权字段。Local App 的按钮点击继续作为其调用面的明确用户动作。

### 4. 保持 `buildr.task-retrospective/v2`

这次修改不改变 capability identity、数据 shape、Application guarantees 或其他 consumer 的调用协议；它把现有“授权不明必须停止”和 Buildr Core 的写入授权原则落实到 provider 的对话阶段。因此更新 v2 contract 的 Consumer Obligations、Effects and Authorization 与 Decision Points，而不引入 v3 迁移。

### 5. 用 package contract test 固化最小文本保证

测试检查 provider 和 contract 均明确：宽泛处理请求零写入、拟 effects 必须先展示、明确用户动作才允许 mutation、方案漂移后必须重新确认。测试不尝试模拟通用 Agent 推理，也不为此建立新的 harness。

## Risks / Trade-offs

- [Risk] Agent 对“明确动作”的理解仍依赖自然语言判断。→ Mitigation：Skill 提供正反例并要求授权覆盖 disposition、理由和 Task effects；不确定时固定保持 `pending`。
- [Risk] 过度确认降低连续执行效率。→ Mitigation：用户直接指定完整动作或明确接受未变化方案时不重复询问。
- [Risk] 只做静态 contract test 不能证明所有 Agent 都正确执行。→ Mitigation：同时更新 canonical spec、contract 与受管 runtime Skill，使各 adapter 投射同一约束；不为单一语义缺口建设重型 Agent harness。
- [Risk] 修改 v2 contract digest 影响已有 runtime projection。→ Mitigation：package sync 原子更新 contract、provider、binding 与 runtime，identity 和版本保持不变。
