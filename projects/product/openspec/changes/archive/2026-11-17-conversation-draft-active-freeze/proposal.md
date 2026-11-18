## Why

在分屏并排展示对话列表与当前对话输入区时，此前的实现根据“是否正在并排编辑当前对话”直接隐藏左侧行的“有草稿”徽标，导致用户点回一个此前已经显示“有草稿”的对话时，“有草稿”立刻从列表中消失；而在该对话中继续编辑或清空草稿期间又已经锁定了行位，造成徽标状态与行位锁定不一致、视觉观感也与“停留当前对话期间左侧列表不动，离开后再更新”的预期不符。

## What Changes

- 统一使用 `settledDraftIds` 作为“有草稿”徽标显隐与排序席位的共同依据：分屏停留于当前对话期间，无论点回、编辑还是清空草稿，左侧列表均完整保持进入该对话前的“有草稿”显隐状态与排序行位不变，不触发列表刷新。
- 离开当前对话（切换到其他对话、新建对话或回到单独列表视图）后，按最新未发送文字与附件统一结算“有草稿”徽标与排序。
- 若对话进入执行中（`starting`、`running`、`stopping`），或在停留期间直接提交发送并确认清空（`clearSubmitted` / `pendingSend`）当前已发草稿，则立即清除列表中的“有草稿”与草稿排位，避免与“执行中”“待发送”同时并存或误留已发送草稿标识。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-conversations`: 修正并排停留当前对话期间的草稿显隐冻结与离开结算规则。

## Impact

- `services/buildr-harness-web`：`conversation-draft-presence.ts`、`useConversationDraftPresence.ts`、`useConversationDraft.ts`、`ConversationHistory.tsx`，以及对应前端单元测试 `test/ui/conversation-draft-presence.test.mjs` 与浏览器端到端检查 `test/browser/draft-list-calm.test.ts`。
- 不修改服务端持久化格式、列表查询接口协议或草稿本地实时保存语义。
