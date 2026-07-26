## Context

现有收尾规则已经要求 `rehearsal → pre-sync → canonical sync → post-sync → archive`，并把最终验证放在 delivery convergence 之后。问题不在于缺少门禁，而在于门禁失败时缺少结构化的“下一步”：Agent 容易手工复制 Requirement、误把旧 receipt 当作有效事实，或把异常归因于测试耗时。此次 Change 只优化这些可复用的编排与诊断边界。

## Goals / Non-Goals

**Goals:**

- 把 OpenSpec 同步表示为 receipt 绑定的单向事务，禁止 pre-sync 前写 canonical 和 post-sync 失败后的猜测性修复。
- 让 post-sync mismatch 返回足以定位的 expected/actual requirement evidence 和确定性的恢复动作。
- 让收尾报告拆分验证 wall-clock、收敛检查和失效重试成本。
- 让 rehearsal 显式使用已解析的绝对 OpenSpec executable。

**Non-Goals:**

- 不降低 strict validation、最终 assurance、远端竞态检查或 doctor 的要求。
- 不让 Buildr 自动修改 canonical specs、自动接受 baseline 或隐藏失败。
- 不改变 OpenSpec 上游 CLI 或创建第二套同步实现。

## Decisions

1. **以 receipt 为唯一同步授权。** Task Finish 在成功 pre-sync 后才允许进入 canonical sync；delta、canonical 或 receipt 任一变化都回到相应门禁，而非继续手写修补。这样保留现有 fail-closed 行为，同时让恢复路径可判断。

2. **guard 输出结构化 requirement 对比。** `post-sync` finding 除 capability/Requirement 外，提供 operation、expected/actual identity 或摘要及限定的 next action。选择诊断而非自动同步：canonical 写入仍属于 Agent 已授权的 sync 动作。

3. **按阶段归因耗时。** task-verification 仍只拥有正式验证 timing；Task Finish 汇总其 evidence，并单列 convergence workflow checks 与因 `implementation-changed`、`target-race`、sync mismatch 产生的失效/重试。避免把并行子检查相加冒充 wall-clock。

4. **显式解析 rehearsal executable。** helper 接收经调用方解析的绝对路径，并在隔离副本执行同一 executable；相对路径拒绝或在复制前解析，避免临时 planning root 改变路径语义。

## Risks / Trade-offs

- [诊断结构变大] → 仅在 failure finding 返回摘要，保持成功 JSON 稳定且不回显完整 spec 正文。
- [严格顺序增加一次前置判断] → 利用已有 receipt/hash，不新增完整验证或第二个 archive。
- [历史调用方依赖现有输出] → 增量新增字段与 next action，不移除现有 stage、finding 和 `ok` 字段。

## Migration Plan

1. 更新 contracts、Skills、guard result schema 与 helper。
2. 为合法路径、过早 canonical 写入、requirement mismatch、相对 executable 和成本汇总补充 contract/integration tests。
3. 对现有 active Change 保持当前 baseline/receipt 格式兼容；缺少新可选诊断字段时继续按现有 fail-closed 规则处理。
