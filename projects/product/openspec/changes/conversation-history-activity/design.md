# 设计：历史未知证据与当前交互控制分离

## Context

`conversationActive` 以保留轮的未知工具作为活动证据，导致当前轮 `completed` 后整条对话仍处于活动区。`canStopConversation` 对 `unknown + stopRequested` 仍返回可停止，因为停止控制只按状态集合判断，没有判断是否仍有活动控制。恢复判定 `conversationRecoveryAction` 只读取服务端当前 `entries`，而停止时页面冻结的 `stoppedOutput` 可能已包含最终答复。

## Decisions

1. **历史停止即退出当前活动，但保留未知证据**：历史保留轮满足 `stopRequested=true`、`executionState!=='active'` 且没有 `running` 工具时，`conversationActive` 返回非活跃。未知工具、诊断和停止请求不修改。
   - 理由：停止意图已经表达；没有活动控制或运行中工具时，继续显示“状态待确认”会把历史不确定性误报为当前工作。
   - 保护：`executionState='active'`、运行中工具、有效请求和未读输出仍使对话活跃。
2. **停止入口只承诺可执行动作**：`canStopConversation` 和 `conversationStopRunIds` 只接受活动执行、运行中工具、可单独停止的工具、真实活动状态或有效请求；已请求停止且非活动控制的 unknown 轮不可重复停止。
   - 理由：按钮存在就应有可核对的停止通道；否则每次点击只会再次得到“无法确认”。
3. **恢复提示以用户可见最终答复为准**：`conversationRecoveryAction` 接受实际渲染的可见条目；`ConversationPanel` 传入合并 `stoppedOutput` 后的 `visibleEntries`，并使用最终主答复判定，而不是只看服务端最新集合或仅对 `completed` 豁免。
   - 理由：用户看到的最终答复不能被另一个状态分支说成“未正常答复”。

## Risks / Trade-offs

- 旧记录不再处于活动区：这正是预期结果；完整历史和未知证据仍可展开核对。
- 停止按钮减少：仅移除无法产生有效控制效果的入口；真实活动工作仍保留停止。
- 恢复提示减少：只在该轮已有可见最终主答复时撤下；“无最终答复”的失败/停止仍保留继续或核对入口。
