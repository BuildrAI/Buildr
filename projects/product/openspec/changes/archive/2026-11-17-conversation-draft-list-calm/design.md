## Context

参见 [proposal.md](proposal.md) 中的问题背景。当前对话草稿正文和附件仍保存在浏览器 `sessionStorage`（外加当前页内存兜底），列表筛选与分页由服务端 SQLite 根据传入的 `draftConversationIds` 执行优先级排序。此前的实现将全部实时草稿 ID 直接作为 `useConversationHistoryPage` 的作用域依赖，导致：
1. 输入/删空每发生一次“空 ↔ 非空”变化，顶部统计（`ConversationHistory.tsx` 中 `count=1` 查询）与所有工作空间分组同时重跑，且旧 `scope` 不匹配时立即返回 `undefined` 引起整栏闪空与转圈；
2. 未排除执行中对话，也未区分“正在并排编辑的当前对话”与“已离开需要防遗忘提醒的历史对话”。

## Goals / Non-Goals

**Goals:**
- 执行中对话彻底忽略草稿展示与列表刷新触发；
- 分屏并排编辑当前对话期间保持左侧列表安静且行位稳定，离开后才结算并柔和更新“有草稿”与排序；
- 顶部“执行中模型”统计与无关工作空间分组不受草稿变化影响，受影响分组原地刷新不闪空、不丢失已加载页窗口；
- 保持 `sessionStorage` 实时保存草稿和跨页刷新恢复能力完全不变。

**Non-Goals:**
- 不改变后端 HTTP 协议、`draftConversationIds` 查询参数或 SQLite 索引；
- 不引入跨标签页草稿广播或改变新对话空白草稿不入列的规则。

## Decisions

1. **草稿感知按工作空间拆分并独立暴露详情（`conversationDraftPresence`）**
   - 保持 `conversationDraftIds` 原签名兼容，新增返回 `{ ids, byWorkspace, unscopedIds }` 的派生函数，将文本草稿键中的所属工作空间解码出来；附件存储沿用对话 ID 无工作空间前缀，保留在 `unscopedIds` 中供各分组过滤。
   - 选择原因：无需改变现有 `sessionStorage` 存储键格式或迁移旧草稿，即可让某个工作空间的普通文字草稿变动与其它无关工作空间完全隔离。
2. **并排编辑期锁定与执行中排除（`shouldShowConversationDraft` / `settleConversationDraftIds` / `workspaceConversationDraftIds`）**
   - 仅当 `keepHistoryOpen`（即分屏并排）且存在 `context.scope` 时，将该对话视为 `activeEditingId`。
   - `settledDraftIds` 跟踪向服务端请求排序的稳定草稿集合：
     - 处于执行中（`starting`/`running`/`stopping`）的对话绝不进入 `settledDraftIds`，其输入/清空不会改变 `settledDraftIds`；
     - `activeEditingId` 若原本在 `settledDraftIds` 中，编辑/清空期间暂时锁定保留原席位；若原本不在，编辑期间不提前加入。离开该对话（打开其它对话、新建对话或关闭分屏）时一次性按实时草稿重新结算。
   - 当 `activeEditingId` 清空已有草稿但尚未离开时，`workspaceConversationDraftIds` 显式保留当前锁定工作空间的该对话 ID，避免键被清空后 `byWorkspace` 消失导致提前掉位。
   - 备选方案（防抖 600ms 原地显隐）已在需求收敛阶段被用户明确放弃，采用交互更稳定的“离开再结算”。
3. **列表刷新解耦与同筛选范围就地保全（`useConversationHistoryPage`）**
   - 移除 `useConversationHistoryPage` 内部对 `useConversationDraftPresence` 的直接订阅，改为由调用方显式传入可选 `draftConversationIds`。顶部 `stats` 概览读取不传 `draftConversationIds`，不再随草稿刷新。
   - 仅在相同 `filterScope`（工作空间、搜索词、隐藏开关、agent、model）内且 `draftScope` 变动时，暂留最近成功页面的条目作为占位（去掉过期 `nextCursor` 防止在旧游标上继续翻页），直到新窗口拉取完毕平滑替换；既保留了完整展开行数 `Math.max(count, current.conversations.length)`，又消除闪空与加载转圈。
4. **“有草稿”徽标轻量淡入淡出（`DraftStatusBadge` + CSS）**
   - `.ac-draft-status` 进入使用 `160ms ease-out` 轻量淡入位移；从可见变为隐藏时，在非执行中且未开启减弱动效的条件下保持短暂 `is-leaving`（`150ms`）淡出后再卸载；一旦对话变为执行中，立即移除避免双标签并存。
5. **当前知识与变更评估**
   - 经核对 `projects/product/knowledge/code-map/technical-layers.md` 及相关说明，文档仅概括 `ConversationHistory` 的搜索防抖与筛选职责，未写死旧的逐键草稿列表刷新行为，无需额外修改知识文档。

## Risks / Trade-offs

- **风险**：当工作空间中某个原本“有草稿”的对话被点开后立刻清空，在切走前的这段编辑期内左侧虽隐藏了“有草稿”文字，但该行仍停留在原草稿分组位置。→ **缓解**：这是为防止输入删空瞬间的剧烈跳行而刻意设计的席位锁定，一旦切到其他对话或返回列表即恢复正常位置；且已通过单元测试与浏览器场景覆盖验证。
- **风险**：附件草稿因存储结构不带 `workspaceId`，若跨多个工作空间同时展开列表，增删图片附件会通知含该 `unscopedIds` 的分组刷新。→ **缓解**：同筛选范围页面原地保留且仅在附件数组从空变非空或非空变空时触发一次，不会出现闪烁。
