# 技术设计：对话 ID 复制入口收敛

## 1. 对话顶栏（`ConversationPanel.tsx`）
- 移除 `.ac-thread-heading` 内的 `.ac-thread-identity` 包装及 `CopyButton` 图标。
- 在右上角 `Dropdown`（`更多对话操作`）菜单项中，在 `rename` 与 `hide` 之间增加：
  - `key: 'copy-id'`
  - `label: chat ? copyConversationIdTitle(chat.id) : '复制对话 ID'`
  - `disabled: !chat`
  - 保留于主对话和嵌入子对话面板中。
- 复用组件内的 `App.useApp()`（解构为 `appMessage`，避免与流消息处理中的局部 `message` 变量冲突）：点击 `copy-id` 后调用 `copyText(chat.id)`，成功调用 `appMessage.success('对话 ID 已复制')`，失败调用 `appMessage.warning('复制失败，请手动选择对话 ID 复制。')`。
- 移除 `agent-conversations.css` 中的 `.ac-thread-identity` 与 `conversation-children.css` 中的 `.ac-child-panel .ac-thread-identity` 规则。

## 2. 对话列表与提醒浮窗（`agent-conversations.css`、`conversation-activity.css`）
- 继续复用各自既有的行级容器 `.ac-history-row`、`.ac-activity-row` 与复制按钮 `.ac-history-row-copy`、`.ac-activity-row-copy`。
- 将按钮默认样式设为 `opacity: 0; pointer-events: none`；仅当满足以下任一条件时切为 `opacity: 1; pointer-events: auto`：
  - 行被悬停：`.ac-history-row:hover > .ac-history-row-copy.ant-btn` / `.ac-activity-row:hover > .ac-activity-row-copy.ant-btn`
  - 行内元素获得键盘焦点：`.ac-history-row:has(:focus-visible) > .ac-history-row-copy.ant-btn` / `.ac-activity-row:has(:focus-visible) > .ac-activity-row-copy.ant-btn`
  - 正处于复制成功提示期：`.ac-history-row-copy.ant-btn[aria-label="已复制"]` / `.ac-activity-row-copy.ant-btn[aria-label="已复制"]`
- 保留已有的右侧防重叠内边距与文字省略规则，使悬停/聚焦显隐按钮时不引起文字重排抖动；不额外引入渐隐延时，确保交互即时且自动化验证稳定读取计算样式。
