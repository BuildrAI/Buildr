## Context

Task Retrospective 已是终态 Task 的可选能力，但 Task Record 与 Task Finish 成功结束后没有统一提示。当前 terminal operation result 已有 `nextActions` 或 `nextAction` 表达后续动作，随包 Skills 负责把结构化结果转成 Agent 的用户可见响应，因此不需要新增生命周期阶段或数据模型。

不同 Agent host 对 Token 使用量的可见性不同。第一版必须保留这一事实边界，避免为了生成看似完整的复盘而增加上下文回放、估算或采集成本。

## Goals / Non-Goals

**Goals:**

- 正式 Task 完成或放弃后稳定提示用户是否进行“任务复盘”。
- 提示是终态结果之后的非阻塞建议，不自动加载或执行复盘。
- 让 Task Record、Task Finish 与相关 Skills 使用同一提示语义。
- 把 Token 证据明确区分为可得、部分可得和缺失，并记录来源与覆盖范围。

**Non-Goals:**

- 不新增复盘门禁、状态机、后台任务、通知系统或 Local App 写入口。
- 不新增数据库字段或修改现有 result schema version。
- 不要求所有终态 Task 必须复盘，也不要求 Token 数必须存在。
- 不建立 Token 估算器、转录回放或新的遥测采集链路。

## Decisions

1. **复用既有结果提示字段。** Task Record terminal operation result 在 `nextActions` 中返回稳定的复盘建议；Task Finish complete result 在现有 `nextAction` 中返回同一建议。相比新增 Retrospective trigger、事件表或第二个 writer，这能保持单一终态写入路径，且兼容现有 JSON consumer。

2. **由结束任务的 Agent 呈现提示。** `task-manager` 与 `task-finish` Skills 要求 Agent 在确认终态成功后，以长期名称“任务复盘”询问用户。Agent 只有在用户明确同意后才路由 `task-retrospective`。相比由 Local App 或 CLI 自动调用复盘，这保留了用户授权边界，并覆盖不同 Agent runtime。

3. **提示语是建议，不是待办门禁。** terminal result 已经成立后才附带提示；提示缺失、未被展示或用户拒绝都不改变 Task 状态、Finish 结果与 cleanup。现有 blocked `nextAction` 继续优先表达恢复动作，不追加复盘建议。

4. **Token 使用量采用证据可见性口径。** 有可信数值时记录数值、来源和覆盖范围；只有局部数据时明确其覆盖范围；不可取得时标记缺失。禁止为了补齐数值额外回放完整对话、读取隐藏推理、强制估算或增加采集流程。相比统一估算，这避免以额外消耗制造不可靠精度。

5. **保持自由 Markdown 报告与现有 SQLite 模型。** Token 的证据状态写入报告正文，不增加结构化字段。第一版优先验证提示是否促成有效复盘，再依据真实使用需求决定是否演进 schema。

## Risks / Trade-offs

- [Risk] 不同 Agent host 对结构化 `nextAction(s)` 的呈现能力不同 → 随包 Skills 同时规定用户可见响应，CLI 人类可读输出也呈现建议，并用一致性测试约束。
- [Risk] 固定完整文案分散后可能漂移 → 产品实现提供共享提示常量，Skills 与契约只固化必需语义和稳定名称。
- [Risk] `nextAction` 过去主要用于 blocked 恢复动作，complete 后出现建议可能影响假定其为空的 consumer → 保持字段类型和 schema version 不变，并补充 complete/blocked 回归测试。
- [Risk] Token 缺失降低定量比较能力 → 报告明确缺失，仍可基于耗时、重复尝试与交互事实提出优化；后续仅在 host 提供低成本可信数据时扩展。

## Migration Plan

1. 更新 OpenSpec、current knowledge 与随包 Skills 契约。
2. 在 Task Record 与 Task Finish 结果中接入共享提示，并更新 CLI 展示。
3. 同步 Codex runtime 投影，运行相关测试、formal Verification 与 doctor。
4. 该变更无 SQLite migration；回滚时移除提示输出与 Skill 指引即可，既有 Task/Retrospective 数据不受影响。

## Open Questions

无。第一版不对复盘接受率、Token 自动采集或 Local App 触发入口作预先设计。
