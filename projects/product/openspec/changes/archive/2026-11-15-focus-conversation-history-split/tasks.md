## 1. 专注分屏布局策略与状态流转

- [x] 1.1 在 `conversation-state.ts` 新增专注分屏常量与纯函数（`canSplitFocusHistory`、`focusHistoryMaxWidth`、`clampFocusHistoryWidth`），确保左栏限制在 `300px–420px`（默认 `340px`）且优先保留右侧 `800px` 完整阅读宽度，并在 `agent-conversations.test.mjs` 补充单元测试验证各宽窄边界。
- [x] 1.2 在 `AgentConversationsContext.tsx`、`ConversationHistory.tsx` 与 `ConversationDock.tsx` 扩展 `preserveHistoryView` 选项，使桌面专注分屏下点击切换对话、导轨新建对话或首次发送创建对话时保持左侧列表展开，退出专注模式（`setFull(false)`）同步回到当前对话视图。

## 2. 专注分屏界面、拖拽限宽与样式适配

- [x] 2.1 改造 `ConversationPanel.tsx`：移除 `.ac-history-drawer` 绝对浮层，在 `focusSplit && view === 'history'` 下渲染 `[.ac-focus-history-pane] + SplitDivider (.ac-focus-history-divider) + [.ac-conversation-view]`；通过 `panelId` 与 `ResizeObserver` 同步测量可用面板宽度；支持指针拖拽、键盘微调、双击恢复默认及本地偏好持久化（`buildr.agent-conversation-history-width`）；将交接抽屉与重命名弹窗放入 `.ac-conversation-view` 内，窄屏自动退回面板内单栏替换。
- [x] 2.2 更新 `agent-conversations.css` 与 `conversation-dock.css`：为 `.ac-panel.is-full` 启用横向分屏排列，为 `.ac-conversation-view` 添加相对定位与防溢出 `min-width: 0`，为 `.ac-history` 保持填满宽度，并约束窄左栏下 `.ac-history-id` 避免横向溢出。

## 3. 端到端场景与验证

- [x] 3.1 更新 `agent-conversation-history-catalog.ts` 与 `agent-conversations-history-scenarios.ts` 中 `history/focus-mode-drawer` 场景，验证专注分屏不遮挡、拖拽与动态上限不压缩右侧 `800px` 阅读宽度、切换/新建保持左栏常驻、收起左栏、窄屏自动钳制与退出专注回归普通分屏，并通过定点浏览器检查与改动影响验证（Static + Unit + 相关 E2E）。
- [x] 3.2 核对当前知识影响清单：确认 `projects/product/knowledge/code-map/technical-layers.md` 第 61 行关于专注模式临时栏的描述变更已记录待用户确认，不越权改写 `knowledge/` 文件。
