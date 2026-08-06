## Context

`inspectTaskTerminalDelivery` 目前在每次读取时分别调用 Task Record、Development、Review、Verification 与 lifecycle read model，再用当前 Result 和 handoff 重新计算关联。它是三个 Local App Tab 的共同依赖，因此一次普通 GET 会重复触达多个专业 reader；完成后的 Task 也不能只展示 Finish 当时实际采用的证据。

本变更只处理第一项优化：把 Finish 已确认的交付关联变为持久事实。三个 Tab 的直接读取和更宽的执行器优化留给后续子任务。

## Goals / Non-Goals

**Goals:**

- 在 Finish durable completion 后保存最小、可验证的 handoff/gate 关联。
- 让终态交付投影从已保存关联构造 delivered 状态，而非用当前专业 Result 重新匹配。
- 对旧数据与未证明完成保持稳定的缺失或未证明语义。

**Non-Goals:**

- 不复制 Review、Verification 或 Development 的完整正文，不新增第二个专业 authority。
- 不改变 Candidate、gate、decision、Finish 阶段或 Local App Tab API 的公开路径。
- 不在 GET 中回填、扫描 Finish 文件、Git 或 Environment。

## Decisions

### 1. 在 lifecycle current read model 保存终态交付关联

将 terminal association 放入已有 Task lifecycle current read model，而非新建独立表或 Finish 目录 reader。它与 terminal summary 同次更新，包含 handoff identity、Candidate identity、各 gate 采用的 target/result digest/outcome，以及写入时间和诊断摘要；不包含任何 Result 正文。

替代的“每次读取 handoff 与当前 Result 再计算”会继续产生重复调用，并会将完成时事实错误地替换为当前状态，因此不采用。

### 2. Finish 是唯一 writer，terminal projection 只消费快照

Finish 在 durable completion 已写入、且 Task Record completed 之后生成关联 projection。关联写入失败必须显式阻止完成报告，不能声称已经交付但没有可读的完成事实。终态 projection 读取保存关联；只有 active、abandoned、no-change 和旧数据走各自明确状态，不回退到实时重新证明。

### 3. 保存 identity，不保存专业正文

关联引用 handoff 与 gate 中已经冻结的 identity/digest，并由对应专业 reader 继续拥有完整 Result。这样页面可以说明“交付时采用”，不会把 Finish 变成 Review/Verification writer，也能避免复制敏感或大体积内容。

## Risks / Trade-offs

- [旧 Task 没有关联快照] → 返回 `completed-unproven` 或明确 unavailable 诊断，不读取历史 Finish/Git 回填。
- [projection 写入在 completion 后失败] → 返回可诊断失败并保留可恢复现场，避免完成结果与 Local App 事实不一致。
- [当前 Result 后来变化] → 页面继续说明最近完成交付采用的快照；current applicability 仍由下一正式生命周期动作更新，不能改写历史交付关联。

## Migration Plan

1. 扩展 lifecycle read model schema/normalizer 与 projection writer。
2. 在 Finish completion 路径写入关联，并让 terminal projection 消费它。
3. 增加 completion、缺失快照和 GET 不重复读取专业节点的测试。
4. 运行受影响验证；回滚只回退代码并保留 read model 的可兼容字段，旧客户端不得猜测或覆盖它。

## Open Questions

无。关联字段限定为当前 handoff 已冻结的 gate identities，已由父任务的边界明确。
