## Why

当前对话列表同时把“执行中”与“有草稿”作为独立徽标并排展示，在后台仍在执行时补充输入会让同一行同时出现两个状态，干扰对当前工作状态的判断。同时，用户在分屏并排输入或删除草稿的每一瞬间，草稿集合立刻变化并触发左侧列表与顶部统计全量重拉，导致“有草稿”频繁闪出/消失、行位置来回跳动、整栏列表出现明显闪烁感。

## What Changes

- 对话处于执行中（`starting`、`running`、`stopping`）时，对话列表仅展示“执行中”，不再同时展示“有草稿”，且该对话的草稿变动不触发列表重刷；执行结束后若仍保留未发送文字或附件且不再处于并排编辑态，再按草稿规则承接。
- 对话列表与输入区并排可见（如桌面专注分屏）时，当前打开对话在编辑期间保持安静：左侧不显示“有草稿”，并锁定当前对话在草稿排序中的既有席位（新草稿不上浮，已有草稿删改不提前掉位）；用户切换到其他对话、新建对话或回到单栏列表视图后，再按最新未发送草稿结算“有草稿”提示与排序。草稿正文及附件仍继续实时保存在本地存储中。
- 顶部“执行中模型”统计查询不再订阅草稿变化，各工作空间分组仅订阅本分组所属草稿集合并在草稿集合更新时保留原列表就地刷新，消除整栏闪空与展开行数回退。
- 为“有草稿”标签增加克制的淡入淡出过渡动效，并尊重系统的减弱动态效果（`prefers-reduced-motion`）偏好；进入执行中时立即清除。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-conversations`: 收敛对话列表在执行中与并排编辑期间对“有草稿”的展示、列表刷新时机与静默过渡规则。

## Impact

- `services/buildr-harness-web`：`conversation-draft-presence.ts`、`useConversationDraftPresence.ts`、`useConversationHistoryPage.ts`、`ConversationHistoryGroup.tsx`、`ConversationHistory.tsx`、`agent-conversations.css`，以及前端单元、类型与浏览器端到端检查 `test/browser/draft-list-calm.test.ts`。
- 不修改服务端持久化格式、列表查询接口协议与草稿实时本地保存语义。
