## Context

参见 [proposal.md](proposal.md)。此前 `ConversationHistory.tsx` 对行位排序传入 `settledDraftIds`，而对 `DraftStatusBadge` 的 `visible` 却调用了 `shouldShowConversationDraft(row, presence.ids, activeEditingId)`，且 `shouldShowConversationDraft` 在 `activeEditingId === row.id` 时强制返回 `false`。这导致点回原本已有“有草稿”标记的历史对话时，虽然席位仍保留在草稿区，但“有草稿”文字在左侧列表瞬间消失；且如果用户在当前对话手动清空后再切走，无法符合“停留在对话时左侧列表纹丝不动、离开才结算”的清晰预期。

## Goals / Non-Goals

**Goals:**
- 使并排停留期间“有草稿”徽标展示与排序席位统一受 `settledDraftIds` 约束，实现真正的进入前状态冻结；
- 点回已有“有草稿”的对话时保留“有草稿”标识与原排位，期间继续编辑或清空都不触发列表刷新、不改变标识与位置；
- 离开当前对话后才统一结算“有草稿”显隐与排序；
- 若停留在当前对话期间发生进入执行中或直接提交发送清空草稿（含排队 `pendingSend`），立即清除“有草稿”和对应排位，防止“执行中”与“有草稿”同时出现或发送后残余徽标。

**Non-Goals:**
- 不改变 `sessionStorage` 草稿保存结构或新增后端字段；
- 不改变新对话空白草稿不入列、统计及无关工作空间隔离规则。

## Decisions

1. **徽标显隐与排序统一对齐 `settledDraftIds`**
   - 将 `shouldShowConversationDraft` 简化为 `shouldShowConversationDraft(row, settledDraftIds)`：若 `isExecuting(row)` 返回 `false`，否则返回 `settledDraftIds.includes(row.id)`。
   - 由于 `settleConversationDraftIds` 在 `activeEditingId === row.id` 时已保持 `previousIds.has(id)`（原本有则保留、原本无则不加入），统一后即可自然做到：原本无草稿的对话停留编辑不提前出现“有草稿”也不上浮；原本有草稿的对话点回、改写或清空时继续保留“有草稿”与原行位，直到离开后才按 `liveIds` 重算。
2. **识别直接发送清空与待发送（`notifyConversationDraftSubmitted` / `pendingSendIds`）**
   - 当用户在当前对话直接点击发送并进入排队（`pendingSend`）或受理后调用 `clearSubmitted` 清空草稿时，不应保留“有草稿”至下次离开。
   - 在 `conversation-draft-presence.ts` 维护 `submittedClearedIds` 与 `notifyConversationDraftSubmitted(conversationId)` / `conversationDraftSubmittedSnapshot()`：当某条已受理/排队清空草稿触发 `clearSubmitted` 时登记该对话 ID；只要后续用户再次在该对话写入非空文本或附件，即通过 `notifyConversationDraft` 自动撤销该标记，恢复常规“停留冻结、离开再算”规则。
   - 在 `settleConversationDraftIds` 中，若 `(pendingSendIds?.has(id) || submittedIds?.has(id)) && !liveIds.includes(id)`（已清空且在发送或已提交），即使 `id === activeEditingId` 也立即从 `settledDraftIds` 移除；对已显示“有草稿”变为执行中或待发送的情况，`<DraftStatusBadge immediateHide={isExecuting(row)||Boolean(sendActivity(row))}/>` 避免短暂动画重叠。
3. **知识影响核对**
   - 本次收敛交互细节未改变系统分层、数据契约或文档描述的职责边界，核对 `projects/product/knowledge/` 后无需更新既有知识文档。

## Risks / Trade-offs

- **风险**：当 `pendingSend` 取消回放恢复草稿并保留在输入框时，当前是否应恢复“有草稿”？→ **缓解**：若取消前本来没有“有草稿”则不提前显示；若取消回填草稿后调用 `setText` 会经 `notifyConversationDraft` 撤销 `submittedClearedIds`，等用户离开对话后按最新草稿正确显示。
