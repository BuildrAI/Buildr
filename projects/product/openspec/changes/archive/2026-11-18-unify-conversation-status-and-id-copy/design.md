## Context

见 `proposal.md` 的动机与范围。当前产品在多处展示并复用对话活动状态与身份：
- `buildr-harness` 负责活动统计（`activityCounts`）与列表分页筛选；
- `buildr-harness-web` 负责列表分组、提醒浮窗、主面板顶栏与子对话入口的状态叠加、已读收敛及对话 ID 渲染；
- `buildr-web` 的 `harness-ui` 复用同一 `ConversationAssociationPopover` 组件承接任务关联对话的展示与搜索。

## Goals / Non-Goals

**Goals:**
- 消除列表、提醒浮窗、侧栏角标、子对话入口之间的状态覆盖、遗漏与文案分裂；
- 消除对话列表、活动浮窗和标题栏常驻完整对话 ID 文本对模型名和标题宽度的挤压，保留便捷复制和短 ID 核对提示。

**Non-Goals:**
- 不改变对话后台持久化结构、`conversations.sqlite` 表结构及 SSE 事件格式；
- 不改变关联任务编码（`taskId`）的展示方式；
- 不新增独立全局状态存储，继续以现有服务端对话视图、`activityRows` 与确认已读快照收敛。

## Decisions

### 1. 将实时活动合并与已读确认快照叠加严格分离
- **决定**：拆分为 `mergeLiveActivity(base, live)` 与 `applySeenSnapshot(base, confirmed)`。
  - `mergeLiveActivity` 用于叠加来自 `activityRows` 或当前打开 `conversation` 的更新活动摘要（保留更大的 `version`，同版本采用最新 `pendingDecisionCount`、`pendingSend`、`updatedAt`、`finalReplyAt`、`userInputAt`，且以 `live.active` 为准、仅在本地已推进 `seenThrough` 时消除纯未读造成的 `active`；当完整视图 `live.pendingSend === undefined` 时显式清理旧缓存上的 `pendingSend`）。
  - `applySeenSnapshot` 专门用于叠加 `/seen` 接口返回的 `seenActivities`：同版本下仅当 `confirmed.seenThrough > base.seenThrough` 时才推进 `seenThrough` 并根据 `confirmed.active || (base.pendingDecisionCount ?? 0) > 0 || Boolean(base.pendingSend)` 计算 `active`；当 `confirmed.seenThrough <= base.seenThrough` 时直接保留 `base`，严禁用较早的已读回执覆盖同版本下新增的 `pendingDecisionCount` 或状态待确认。
- **替代方案**：在每次 `requests` 变化时强制提升服务端 `activity.version`。这会破坏“未读版本号只随可见正文消息变化”的既定语义，导致阅读中弹出问题卡片误触发“待查看”或重刷列表排序，因此不采纳。

### 2. 对话列表与提醒浮窗共用同一实时叠加管线
- **决定**：`ConversationHistoryGroup` 与 `ConversationActivity` 统一通过 `applyConfirmedSeenActivity(row, seenActivities, conversation, activityRows)` 计算显示状态；`ConversationActivity` 同样纳入当前打开对话（若处于活跃态）并按叠加后 `isActiveConversation` 过滤，且在 `AgentConversationsContext`、`conversation-history-page` 与 `workspaceOtherActivitySignature` 中纳入 `pendingSend.state`、`pendingSend.reason` 与 `activityCounts` 变更检测。
- **影响**：无论通过常规刷新、SSE 当前对话推送还是 `/seen` 确认，列表与浮窗均立即对齐，不会各自滞后。

### 3. 发送失败纳入待处理统计与提醒分组
- **决定**：在 `ConversationRepository.querySummaries` 中将 `activityCounts.attention` 口径对齐为包含 `send-failed`，新增可选字段 `activityCounts.sendFailed`（仅大于 0 时返回，零值省略以兼容现有闭合校验），并将 `activityState=attention` 查询扩展为 `activity_state IN ('waiting','unseen','unknown','send-waiting','send-failed')`；前端 `activityBadge` 与 `activityReminder` 同步将 `sendFailed` 计入橙色「待处理」角标。
- **兼容性**：`sendFailed` 为可选字段且仅非零时返回，原有 `activityCounts` 既有测试用例与旧响应消费者零破坏。

### 4. 子对话状态复用 `activityState` 与主列表统一文案
- **决定**：`conversation-children.ts` 优先调用 `activityState` 判定 `send-failed`（`发送失败`）、`send-waiting`（`等待发送`）、`waiting`（`待决策`）、`unknown`（`状态待确认`）、`running`（`执行中`）、`unseen`（`待查看`），无活跃状态再回落终态/后台作业文案（`后台作业运行中`、`执行失败`、`已停止`、`已答复`、`尚未开始`）；`ConversationChildWindows` 复用 `applyConfirmedSeenActivity` 与 `activityState` 控制圆点颜色与显现时机。

### 5. 对话 ID 精简为带 8 位短 ID 悬停提示的复制按钮
- **决定**：在对话列表、提醒浮窗和当前对话标题栏移除常驻 ID `<span>`，保留 `CopyButton`（`aria-label="复制对话 ID"`，`title="复制对话 ID（<前8位>）"`，点击复制完整 ID）；针对无模型元信息的单行历史/浮窗项补充垂直居中防重叠样式；关联对话浮层（`buildr-harness-web` 与 `buildr-web` 同步维护）将展示后缀缩为 8 位短 ID 并在 `title` 保留完整 ID，不改变关联数据标识与匹配能力。

## Risks / Trade-offs

- **Risk**: 既有浏览器测试与 UI 测试中直接断言了 `.ac-history-id`、`.ac-activity-id`、`.ac-thread-identity>span` 文本或子对话旧文案（`等待回答`、`正在处理`） → **Mitigation**: 同步更新所有受影响的 UI 测试、浏览器 E2E 场景及规范条款，并逐项运行验证。
- **Risk**: `buildr-harness` DTO/schema 修改后可能引起 `buildr-harness-web` 或 `buildr-web` 类型与契约检查不匹配 → **Mitigation**: 修改 schema 后立即运行 `agent:prepare` 重新生成 DTO 并执行静态检查与全量测试。
