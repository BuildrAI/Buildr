## 1. 专注模式与对话列表状态持久化及解耦

- [x] 1.1 在 `services/buildr-harness-web/src/features/agent-conversations/conversation-state.ts` 新增 `shouldPreserveFocusHistory` 辅助函数并补充单元测试
- [x] 1.2 在 `services/buildr-harness-web/src/features/agent-conversations/AgentConversationsContext.tsx` 持久化 `full` 与专注模式下 `view`，并在初始恢复、`openConversation` 与 `newConversation` 默认保持专注分屏列表展开（普通分屏刷新回到对话视图）
- [x] 1.3 更新 `services/buildr-harness-web/src/HarnessApp.tsx`、`ConversationPanel.tsx` 与 `ConversationDock.tsx`：消除内嵌首帧强制 `setFull(true)` 覆盖、新对话切换工作空间保持对话列表展开、内嵌导轨列表展开态点当前对话切回对话而非收起整块面板、底栏坐标跟随左栏宽度更新
- [x] 1.4 更新 `services/buildr-web/src/features/harness-ui/AgentConversationsContext.tsx` 与 `ConversationWorkspace.tsx`：持久化 `buildr.harness-panel-full` 与 `buildr.harness-panel-view` 并在专注分屏右侧保留任务关联底栏

## 2. 共享 Mermaid 流程图放大预览与纵向滚动衔接

- [x] 2.1 在 `buildr-harness-web` 与 `buildr-web` 的 `src/lib/markdownDiagramSvg.ts` 增加块级 SVG 存储与 `sanitizeDiagramSvg` 安全校验
- [x] 2.2 同步更新 `buildr-harness-web` 与 `buildr-web` 的 `src/markdown.ts` 与 `src/shared.css`（保持两服务文件字节一致），开放图表纵向滚动链并在到达边界/无纵向溢出时向祖先滚动容器传递滚轮，并配合 `markdownDiagramPreviews.ts` 在渲染后为 Mermaid 块补充右上角放大按钮
- [x] 2.3 同步更新两服务的 `src/lib/markdownDiagrams.ts`，新增 `src/lib/markdownDiagramPreviews.ts` 与零 `antd` 依赖的 `src/components/MarkdownDiagramPreview.tsx` 实现全屏矢量预览（缩放、平移、适应窗口/1:1、复制源码、导出 PNG）
- [x] 2.4 更新 `buildr-harness-web` 与 `buildr-web` 的 `src/components/MarkdownHost.tsx` 及 `buildr-web/src/features/harness-ui/ConversationWorkspace.tsx`，实现独立与内嵌顶层全屏矢量预览（含 `buildr.harness-frame/v1` 的 `diagram-preview` 协议事件及切换/收起时自动关闭）

## 3. 知识核对、测试与验证

- [x] 3.1 核对 `knowledge/code-map/system-services-assets.md` 与 `knowledge/code-map/harness-products.md` 与本变更职责边界一致，确认无事实漂移
- [x] 3.2 补充单元测试（`buildr-harness-web/test/ui/agent-conversations.test.mjs`、`markdown-diagrams.test.mjs`）与浏览器端到端检查（`buildr-harness-web/test/browser/markdown-overflow.test.ts`、`buildr/test/e2e/harness-frame.ts`）
- [x] 3.3 构建 `buildr-harness-web` 与 `buildr-web` 产物，执行静态检查、单元测试与浏览器 E2E 检查并全部通过
