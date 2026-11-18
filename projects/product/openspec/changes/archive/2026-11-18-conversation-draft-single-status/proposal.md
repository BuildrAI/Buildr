## Why

此前对话列表仅在会话处于“执行中”（`starting`、`running`、`stopping`）时隐藏“有草稿”徽标并忽略草稿变化。而当会话处于“待查看”“待决策”“等待发送”“发送失败”或“状态待确认”等其他活动状态时，若输入框仍留有未发送草稿，列表中同一行会同时出现两个状态徽标（例如“待查看”与“有草稿”或“待决策”与“有草稿”），不仅增加视觉噪点，而且由于所有活动状态在列表排序上本就严格高于纯草稿，同时显示“有草稿”既无排序意义又容易打断用户对当前首要待办状态的专注。

为使对话列表信息层级保持清晰克制，需要将规则统一为：**只要对话存在任意活动状态，列表就不展示“有草稿”，每行同一时刻最多只显示一个状态标识**，并在活动状态全部消除后平滑衔接回草稿展示与结算规则。

## What Changes

- 将 `buildr-harness-web` 对话列表中的草稿隐藏条件由仅判断 `isExecuting` 扩展为判断任意非空活动状态 `activityState(row) !== null`（覆盖 `running` 执行中、`waiting` 待决策、`unseen` 待查看、`send-waiting` 等待发送、`send-failed` 发送失败、`unknown` 状态待确认全部 6 种活动状态）。
- 在草稿 ID 结算逻辑（`settleConversationDraftIds`）与 `ConversationHistory` 中引入基于已确认已读叠加视图的活动集合 `activeStatusIds`：当对话处于任意活动状态期间，不将其计入已结算草稿列表，避免输入/编辑/清空草稿触发多余的列表请求；同时在任意活动状态突然出现时立即撤下“有草稿”而不播放双徽标重叠的离场动画。
- 保持活动消除后的自然衔接：
  - 未停留在当前并排查看对话时，只要全部活动状态清除且仍保留未发送文字或附件，立即按草稿规则显示“有草稿”并参与草稿排序；
  - 在并排视图点开带未发草稿的“待查看”对话消除未读时，停留期间保持列表行安静（不在“待查看”消失瞬间突兀弹出“有草稿”），离开该对话后再按最新未发送内容平稳显示“有草稿”；
  - 已处于空闲并显示“有草稿”的历史对话重新点回时继续保持原“有草稿”标识与排序席位冻结，直到离开或直接发送清空。
- 同步更新 `openspec/specs/agent-conversations/spec.md` 中的 `已有对话草稿必须可发现并优先于普通历史` 需求及单测、浏览器端到端验证。
- 不修改后端 SQLite 排序或 HTTP 协议（后端 `querySummaries` 已将所有活动状态排在纯草稿优先级 `1` 之上，且未发送草稿本身仍在本地安全保留）。

## Capabilities

### Modified Capabilities
- `agent-conversations`: 扩展对话列表草稿屏蔽范围至全部非空活动状态，明确单状态徽标不变量、零冗余刷新以及并排查看消除“待查看”等活动状态后离开再显现“有草稿”的自然衔接规则。

## Impact

- Affected specs: `openspec/specs/agent-conversations/spec.md`
- Affected services: `services/buildr-harness-web`（`conversation-draft-presence.ts`、`ConversationHistory.tsx` 及其单测与浏览器 E2E）
- Unchanged boundaries: 后端 `buildr-harness` 会话存储与排序 SQL、本地 `sessionStorage` 草稿与附件持久化机制均保持不变。
