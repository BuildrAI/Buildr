## Context

动机见 [proposal.md](proposal.md)。当前产品边界：
- `buildr-harness-web` 拥有完整唯一对话页面与状态（独立运行或作为 `/harness/` 被 `buildr-web` 嵌入）；
- `buildr-web` 的 `harness-ui` 负责外层面板显隐、全屏专注占位、工作空间配置和工程关联底栏；
- `buildr-harness-web` 与 `buildr-web` 共用同源对齐的 Markdown 渲染模块（`src/markdown.ts` 与 `src/shared.css` 须保持字节完全一致，各自零跨包源码导入）。

## Goals / Non-Goals

**Goals:**
- 在同浏览器配置域内，专注模式（`full=true`）及其对话列表展开状态在刷新后稳定恢复，而普通分屏刷新及显式收起面板/退出专注模式维持原有安全默认视图。
- 专注分屏下切换新对话工作空间、首条发送或切换对话不关闭左侧对话列表；内嵌导轨和任务关联底栏状态按职责清晰解耦。
- 为共享 Markdown 阅读器的已渲染 Mermaid 流程图提供全屏矢量放大预览、缩放平移复位及 PNG 导出，并在容器纵向到达顶部/底部或无溢出时把纵向滚轮平滑衔接至外层滚动容器。

**Non-Goals:**
- 不改变普通分屏模式下单栏历史列表的临时替换行为，也不在普通分屏刷新后继续停留在隐藏输入区的列表页。
- 不放宽 Mermaid 本地沙箱 iframe 与 DOMPurify 过滤约束，不引入外部网络资源加载。

## Decisions

1. **双端协同持久化专注模式与列表状态**：
   - 外层 `buildr-web/src/features/harness-ui/AgentConversationsContext.tsx` 持久化 `buildr.harness-panel-full` 与 `buildr.harness-panel-view`（通过现有可选偏好键），在刷新时先用同源偏好初始化，再经 `configure` 消息下发给 `/harness/`；显式收起面板（`setOpen(false)`）或退出专注（`setFull(false)`）时清除专注/列表偏好，避免意外停留在隐藏面板后的旧专注态。
   - 内层 `buildr-harness-web/src/features/agent-conversations/AgentConversationsContext.tsx` 同时在 `sessionStorage` 与 `localStorage`（按 profile 隔离）记录 `full` 与专注下的 `view`；在 `HarnessApp.tsx` 内嵌挂载时不再无条件调用 `setFull(true)`，避免覆盖外层或恢复阶段的状态；首次恢复已有对话（`saved.scope`）时仅在 `initialFull && initialView === 'history'` 下保留 `history` 视图。
   - 替代方案：仅靠 URL 查询参数或只存内层状态。前者污染导航历史与分享链接，后者会被外层 `configure({ full: false })` 瞬间覆盖；双端以同一可选偏好同步最稳妥。

2. **专注分屏列表保活与导轨/底栏解耦**：
   - 抽出纯函数 `shouldPreserveFocusHistory(full, view, panelWidth, viewportWidth)`，在 `openConversation` 与 `newConversation` 未显式传 `preserveHistoryView` 时默认保留专注分屏下的 `history` 视图；同时在 `ConversationPanel.tsx` 新对话工作空间 `<Select>` 的 `onChange` 中保留 `preserveHistoryView: context.view === 'history'` 并仅关闭位置弹层。
   - 在 `ConversationDock.tsx` 内嵌点击导轨「展开当前对话」时，若当前列表打开（`context.view !== 'conversation'`），先执行 `context.setView('conversation')` 切回（或在专注分屏中收起左侧列表），而非向父窗口发 `collapse` 收起整块面板。
   - 在 `ConversationWorkspace.tsx` 中将任务关联底栏条件改为 `context.full || context.view !== 'history'`，并在 `ConversationPanel.tsx` 上报 `context-anchor` 时监听 `focusSplit` 与 `effectiveHistoryWidth` 变化，使专注分屏右栏实时显示并精确对齐底栏。

3. **共享 Mermaid 全屏矢量预览与边界滚轮衔接**：
   - 纵向滚轮衔接：在 `shared.css` 中将 `.markdown-diagram-view` 的 `overscroll-behavior: contain` 改为 `overscroll-behavior-inline: contain` 放开纵向滚动链；并在 `markdown.ts` 为 `.markdown-diagram-view` 绑定非被动 `wheel` 监听，当无修饰键且以纵向为主、同时容器在该方向已达顶部/底部或无纵向溢出时，沿祖先查找可沿该方向滚动的最近容器（优先 `.ac-stream` 或阅读区容器），阻止默认并在其 `scrollTop` 累加像素增量（保持事件继续冒泡以触发外层 `useEarlierConversationEntries` 向上加载）。
   - 矢量放大预览：在 `markdown.ts` 中为已渲染 Mermaid 块增加右上角放大按钮并开放容器点击/键盘触发；用 `WeakMap` 绑定块节点与经二次安全校验的 SVG 原文；新建零 `antd` 依赖的 `MarkdownDiagramPreview.tsx`（仅依赖 `react`/`react-dom`/`copyText`/`markdownDiagramSvg`）实现自适应、滚轮锚点缩放、拖拽平移、1:1 切换、源码复制与 SVG 转 2x 白底 PNG 导出；内嵌 iframe 中通过 `buildr.harness-frame/v1` 的 `diagram-preview` 事件代理至父窗口全屏打开，确保分屏模式也能整屏大图阅读。
   - 替代方案：直接用浏览器原生滚动链不加 JS 转发，在 macOS 触控板 scroll-latching 下仍经常在子容器到顶/底时卡住无法立即滚动外层信息流；使用零 `antd` 弹层组件也可保证 Node 轻量逻辑单测不引入额外 UI 依赖。

## Risks / Trade-offs

- **[Risk] 字节对齐测试失败**：`host-boundaries.test.mjs` 要求 `buildr-harness-web` 与 `buildr-web` 的 `src/markdown.ts`、`src/shared.css` 完全一致 → Mitigation：两份源码同步写入并在构建与静态测试中强制校验 `diff`。
- **[Risk] 浏览器存储不可用或旧状态残余**：普通分屏历史状态若在刷新后恢复会隐藏输入框并破坏现有回归场景 → Mitigation：仅当 `full === true` 时持久化/恢复 `history` 视图，存储异常时捕获降级而不阻断使用。
- **[Risk] 跨 iframe SVG 预览输入风险**：通过 `postMessage` 传递 SVG 字符串存在恶意注入风险 → Mitigation：发送端来自本地沙箱 DOMPurify 结果，接收端 `ConversationWorkspace` 与 `MarkdownDiagramPreview` 再次执行 `sanitizeDiagramSvg` 白名单校验，并限制协议来源与 origin。
