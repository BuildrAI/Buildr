## Context

在 Antigravity 接入中，当 `command` 工具进入后台运行后，`session/prompt` 会提前返回 `end_turn`。执行器通过 `observeBackgroundCommands` 观察到后台命令全部退出后，会在同一原生会话发送内部续行提示（`[[buildr:background-continuation]]`），把命令结果交回模型继续处理。

目前存在三项相互关联的缺陷：
1. `MAX_BACKGROUND_CONTINUATIONS` 为 `8`，长流程研发任务很容易触顶；
2. 用户在同一轮通过 `supplement` 追加新任务指令时未重置 `turn.continuations`，使同轮长协作仍累计消耗同一笔预算；
3. 触顶分支（`turn.continuations >= MAX_BACKGROUND_CONTINUATIONS`）仅置 `turn.status = 'unknown'` 与诊断文字，没有关闭空闲会话进程或允许 `prepareRelease`/`canRelease` 释放控制资源。结果造成：
   - 正常运行时界面因 `resourcesReleased !== true` 不渲染“继续原任务”按钮，对话卡在无操作闭环的待确认状态；
   - 若随后发生服务更新/退休接管，`releaseRetiredWork`、`view`、`reconcileReleasedControls` 或 `reconcile` 会覆盖上限诊断并写入 `record.interruption`，进而自动触发 `recoverOne` 重跑，违背“触顶后暂停交由人确认”的设计意图。

## Goals / Non-Goals

**Goals:**
- 将单轮后台自动续行默认上限提高到 `20`（保持 `export const MAX_BACKGROUND_CONTINUATIONS = 20`，同时允许通过执行器选项注入较小值用于快速集成测试）。
- 已受理的用户 `supplement` 重置本轮自动续行预算（`continuations = 0`、`continuationLimitReached = false`）；即时拒绝或传输失败的追加不重置；持久化续行行 ID 使用独立单调递增序号 `continuationSequence`，确保同一 `executionId` 下重置预算后不会出现 `continuation:<executionId>:<n>` 冲突。
- 触顶暂停时在所有运行中工具已结、无待决请求且无活动模型提示的前提下，关闭该对话所属空闲 `agy` 进程并允许通过物理进程退出核验完成 `resourcesReleased = true`。
- 应用层收到上限诊断时及时触发空闲源释放，并在空闲释放、服务退休、跨代视图、控制核对和重连观察中完整保留上限诊断、禁止建立自动恢复 `interruption`。
- 用户点击“继续原任务”时直接接续已完成的后台命令结果和当前成果，不因上限暂停而无法恢复。

**Non-Goals:**
- 不改变 Codex、DSH、Qoder、Claude 等其他执行器的自动续行策略。
- 不改变有未完成（`running`/`unknown`）工具时的保护原则：若还有未取得结束回执的工具，仍遵循原有未知工具提醒与不重跑原则。

## Decisions

1. **预算计数器与持久化序号分离**
   - `TurnState.continuations` 专责记录自本轮启动或最近一次已受理用户输入以来的后台续行次数，受 `maxBackgroundContinuations` 约束；
   - `TurnState.continuationSequence` 专责生成会话 JSONL 中的稳定行标识 ``continuation:${turn.executionId}:${turn.continuationSequence}``，只增不减；
   - 仅在 `supplement()` 中 `dispatched.owner.admitted = true` 确立后才重置 `turn.continuations = 0` 与 `turn.continuationLimitReached = false`；被拒绝或未确认受理的追加不会误重置预算。

2. **触顶后安全释放空闲进程而不伪造退出证明**
   - 触顶仅发生在 `turn.stopReason === 'end_turn'`、无待回应请求、无运行中工具且 `turn.backgroundWork` 已转为 `false` 时，此时底层原生回合已经结束且没有在途后台命令。
   - 触顶时设置 `turn.continuationLimitReached = true`、`turn.status = 'unknown'`、`turn.diagnostic = BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC`，发送更新后异步调用 `this.coordinator.closeConversationProcess(turn.contextId)` 关闭空闲 `agy` 子进程；因 `turn.pending` 和 `turn.backgroundWork` 均为 `false`，`onExit('acp_closed')` 不会改写已设置的 `turn.diagnostic`。
   - `prepareRelease()` 和 `canRelease()` 放行 `turn.continuationLimitReached === true`，但仍必须通过 `handle.client.released` / `releasedNativeControl` 的物理进程组退出核验后才返回 `true`（`prepareRelease` 会在必要时先等待 `closeConversationProcess` 完成），不跳过物理证明。

3. **统一上限诊断常量与全链路保护**
   - 在 `buildr-harness/src/domain/agent-state.ts` 导出 `BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC = '后台结果已取得，但自动续行次数已达上限；未报告为完成。'`。
   - `ConversationApplication` 在 `applyObservation` 观察到该诊断且尚未释放资源时，主动通过微任务调用 `releaseIdleSources({ workspaceId, id })` 立即完成释放，使用户在页面上即时看到“继续原任务”按钮。
   - 在 `releaseIdleSources`、`releaseRetiredWork`、`view`、`reconcileReleasedControls` 与 `reconcile` 中识别 `BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC`，保持 `run.status = 'unknown'` 与原诊断文字，绝不写为 `RETIRED_EXECUTION_DIAGNOSTIC` 或 `'原生观察未匹配本轮执行...'`，并清除/不写入指向该轮的 `record.interruption`，从而彻底阻止自动重跑。
   - 用户显式继续（`continueRunId`）时：`execute` 中原会话与历史重读若因该上限轮次产生“已结束工具且仅缺终态”的重读条目应保持幂等一致，并经 `continuationDraft` 生成针对该上限暂停且无未知工具时的准确继续提示，提醒智能体读取已完成后台结果后继续完成目标。

4. **前端摘要与恢复文案联动**
   - `buildr-harness-web` 中的 `conversationUnknownExecutionSummary` 与 `conversationObservationFeedback` 识别「自动续行次数已达上限」诊断，展示清晰业务原因（“后台自动续行已达上限，本轮已暂停。”）并配合既有 `canContinueConversation` 呈现唯一“继续原任务”按钮。

## Risks / Trade-offs

- **上限提高到 20 次可能略微延长异常空转时间**：每次后台命令至少等待真实命令完成，20 次相对于 8 次仍在有界范围内；触顶后立即关闭原生进程并禁用自动恢复，可确保不会跨服务重启继续空转。
- **补充消息被拒绝不能重置预算**：通过把重置严格放在 `dispatched.owner.admitted = true` 之后，避免并发拒绝或传输未确认错误绕过预算约束。
- **跨代接续兼容性**：由于 `Antigravity` 沿用原有 `releasedContinuation` 与同原生会话继续能力，需通过集成测试实际验证触顶释放后执行 `continueRunId` 发送能够正常创建新一轮并读到同一上下文，无 `agent_history_changed` 误报。
