## 1. 界面实现与样式调整
- [x] 1.1 修改 `ConversationPanel.tsx`，移除 `.ac-thread-identity` 常驻复制按钮，并在标题栏右上角 `⋯`（更多对话操作）菜单增加 `复制对话 ID（<8位短ID>）` 菜单项与轻提示反馈。
- [x] 1.2 修改 `agent-conversations.css`、`conversation-activity.css` 与 `conversation-children.css`，移除顶栏 `.ac-thread-identity` 规则，并将 `.ac-history-row-copy` 与 `.ac-activity-row-copy` 设为默认隐藏、仅在行悬停、键盘聚焦或已复制反馈期间显现。

## 2. 端到端测试与验证交付
- [x] 2.1 更新 `standalone.test.ts`、`agent-conversations-setup-scenarios.ts` 与 `agent-conversations-history-scenarios.ts`，验证默认隐藏与悬停显现、顶栏菜单项复制及轻提示行为。
- [x] 2.2 构建并运行 `e2e-browser:agent-conversations`、独立浏览器测试、受影响检查脚本及四服务全量检查，归档变更并集成交付与自举同步。
