## Context

在 `buildr-harness-web` 中，专注分屏模式会保持左侧 `ConversationHistory` 与右侧 `ConversationPanel` 并排可见。点击进入“待查看”对话并在右侧看到最新可见消息后，`sendSeen` 会持久化后端 `seenThrough` 并立即触发 `refreshActivity()`，进而递增 `activityTick` 与对应工作空间的 `activityWorkspaceTicks[workspaceId]`。这导致 `ConversationHistoryGroup` 立即重拉并按已读态降级重排，当前行瞬间向下跳出视线，同时 `ConversationHistory` 顶部统计查询也因共享 `activityTick` 发起重读。

## Goals / Non-Goals

**Goals:**
- 并排查看“待查看”对话并在视口看到最新回复后，立即隐藏左侧该行的“待查看”标签、保存后端 `seenThrough` 并更新侧栏未查看统计；
- 停留在当前对话阅读期间，维持左侧该行排序席位稳定，不因本次查看确认触发该分组重排及无关统计或跨空间列表请求；
- 离开当前对话（切到另一对话、新建对话或离开并排列表）后立即释放锁位并刷新分组使其按真实历史归位；
- 停留期间若该对话发起新发送、变为执行中或进入待决策，或同工作空间其他对话发生状态变化，均能正确响应而不丢状态。

**Non-Goals:**
- 不改动服务端 SQLite 索引、分页排序 SQL 或 `/seen` HTTP 接口定义；
- 不改变单栏历史列表、提醒浮窗、子对话窗口与“阅读旧消息”防误标已读机制。

## Decisions

1. **在 `AgentConversationsContext` 记录服务端返回的完整已读 `activity` 快照**：
   - `sendSeen` 收到 `client.seen(value, version)` 的返回 `{ activity }` 后，以 `${workspaceId}:${id}` 单调记录到 `seenActivities`（包含服务端计算的精确 `active` 与 `seenThrough`）。
   - 相比仅把 `seenThrough` 覆盖成 `version`，保存完整 `activity` 可避免将正常结束且无未知执行的已读对话误判为 `unknown`（“状态待确认”），并确保随后收到更高 `version` 的新消息时立即恢复展示“待查看”。
   - 该快照同样覆盖切走瞬间尚未返回新页之前的行渲染，避免“待查看”标签在列表刷新前闪回。

2. **在 `ConversationHistoryGroup` 维护查看席位锁定（Seen Hold）与离开结算**：
   - 新增纯函数模块 `conversation-seen-hold.ts` 统一管理锁位状态转换：仅当 `keepHistoryOpen` 且进入本工作空间时处于 `unseen` 的对话时建立锁位，锁住传给 `useConversationHistoryPage` 的原始列表版本（保持 `workspace:<tick>` / `global:<tick>` 原始格式以兼容 `validVersions`）。
   - 停留期间若同工作空间其他对话活动签名未变，完全抑制分组重拉，行位与分组均不动；若同工作空间其他对话发生后台变更，允许列表刷新同时通过 `pinHeldConversationRow` 将当前正在查看的对话维持在进入时的席位（即使因新增活动行掉出当前窗口也能插回原席位不跳走），并在离开时把暂存的列表缓存版本标为过期以重新对齐权威排序。
   - 若直接从已读锁位对话 `C1` 点进另一条待查看对话 `C2`，`pinnedIndex` 会扣减前序行中正在结算退出的 `C1`，从而 `C1` 正常归位、`C2` 锁定在结算后的新位置。
   - 若当前对话直接发起新发送、进入执行中或出现待决策，`shouldReleaseSeenHold` 立即解除锁位。

3. **隔离顶部执行中模型统计与当前知识影响评估**：
   - `ConversationHistory` 顶部的 `limit=1` 执行中模型统计改由 `executionStatsSignature` 驱动版本递增（仅当真实执行中对话及分布变化时刷新），避免 `seen` 已读确认引发冗余统计请求。
   - 知识影响评估：已核对 `projects/product/knowledge/docs/architecture/agent-integration.md`，其说明围绕“悬停或筛选不确认消息已查看，只有可见最新正文确认准确查看位置”与既有列表原则，与本次并排视图局部防跳位体验调整保持一致（`aligned`），无需改写知识库。

## Risks / Trade-offs

- **并发后台刷新与分页截断**：若停留期间同空间有其他新对话插入并触发该组刷新，当前已读对话在固定席位期间会短暂钉在原索引并使底部最后一条暂不显示，待离开当前对话时立即失效缓存并恢复服务器权威分页顺序，该行为完全可控且仅发生在多对话并发变化的极端停留期内。
- **跨模式切换**：退出并排分屏或收起面板切换单栏时 `activeViewingId` 立即变为 `null`，会即时释放在内存中的锁位并结算真实顺序，不会残留旧席位。
