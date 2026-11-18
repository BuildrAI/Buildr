# 设计方案：专注/分屏持久化加固与信息流流程图自适应

## Context

- Buildr Web 宿主（`buildr-web`）通过同源 `/harness/` iframe 嵌入 `buildr-harness-web`。面板展开（`open`）、专注模式（`full`）以及专注模式下的对话列表栏开关（`view`）保存在外层 `AgentConversationsContext` 并经 `buildr.harness-frame/v1` 协议下发。
- `buildr-web` 的源码控件缓存可占用较大 `localStorage` 空间；另外，宿主外层与内嵌 iframe 挂载时序不固定，如果缺少初始化配置前隔离与显式动作载荷，容易发生刷新回退。
- 共享 Markdown 渲染器（`markdown.ts` + `shared.css` + `markdownDiagramSvg.ts`）同时服务对话信息流（`.ac-stream`）与非信息流长文/任务资料阅读容器（如 `#task-node-content`、知识正文），且测试要求 `buildr-web` 与 `buildr-harness-web` 之间的 `src/markdown.ts` 和 `src/shared.css` 逐字节一致。

## Goals / Non-Goals

### Goals
1. 无论用户处于专注模式还是分屏模式，刷新页面都稳定保持原模式及专注模式下的列表展开/收起状态。
2. 即使 `localStorage` 被 `buildr:source-control-cache:*` 写满，偏好写入通过缓存驱逐与标签页会话兜底依然生效。
3. 对话信息流内的已渲染 Mermaid 流程图在保持纵横比的前提下完整适配消息容器，不出现水平或垂直滚动条，同时点击/放大仍可弹出全屏矢量预览。
4. 保留任务资料、知识正文等非信息流阅读场景的局部滚动与滚轮边界衔接能力。

### Non-Goals
- 不变更源码控件缓存键命名策略或全局配额上限，只在可选偏好写入遇到配额异常时按明确前缀按需驱逐。
- 不将信息流无滚动条规则强制套用到非信息流文档阅读容器或源码回退视图。

## Decisions

### Decision 1: 存储配额按需驱逐与标签页会话镜像兜底
- 在两份 `optional-preferences.ts` 的 `writeOptionalPreference` 中，当默认 `localStorage` 写入抛出异常时，收集同存储内以 `buildr:source-control-cache:` 为前缀的键逐一删除并重试写入；若仍失败则维持静默降级不抛异常。
- 在 `AgentConversationsContext.tsx` 中引入基于 `sessionStorage` 的单标签页偏好镜像键（`buildr.harness-panel-session:v1`）保存 `{ open, full, view }`：初始化优先参考 `localStorage`（已有明确值以持久化配置为准，缺失时回退到同一标签页的 `sessionStorage` 快照），状态变更同步写入 `localStorage` 与 `sessionStorage`。为支持从旧版或异常存储恢复，保持 `fullRef`、`openRef`、`viewRef` 与 React state 同步。

### Decision 2: 嵌入式 iframe 握手计数与配置前保护
- `ConversationWorkspace.tsx` 将 `ready` 状态改为递增计数（收到 `ready` 事件递增，`onLoad` 重置 `configured.current = false` 与 `lastCommand.current = -1`），确保 iframe 重载也能再次发送 `configure`。
- `configure` 消息显式包含 `view` 字段；只有宿主收到/发送本轮 `configure` 并由 `configured.current = true` 放行后，才接受内层传来的 `view` 同步，避免内层初次渲染默认的 `conversation` 状态覆盖宿主恢复的 `history` 视图。
- `HarnessApp.tsx` 使用 `initialConfigured` 标记区分首次配置：首次收到 `configure` 时按消息中的 `full` 与 `view` 还原，后续才将本地 `view` 变化回传宿主。
- `ConversationPanel.tsx` 发送 `layout` 动作时，若为 `'full'` 则显式携带目标布尔值 `{ action: 'full', full: !context.full }`；宿主侧优先采纳显式布尔值，缺省兼容取反。

### Decision 3: 信息流内渲染流程图比例适配无滚动条
- 在 `markdownDiagramSvg.ts` 的 `setDiagramSvg` 中，当 `drawing.viewBox.baseVal` 具备正宽高时，同时确保 SVG 元素写有正整数/正数 `width` 与 `height` 属性，保证浏览器在覆盖 CSS 宽高为 `auto` 时具备正确的固有宽高比。
- 保持 `.markdown-diagram-view` 的基础局部滚动样式不变以兼容文档/任务资料及源码/失败状态；仅针对 `.ac-stream .markdown-diagram[data-mermaid-state="rendered"] > .markdown-diagram-view` 覆盖 `max-height: none; overflow: hidden;`，并设置内部 `> svg { width: auto !important; height: auto !important; max-width: 100% !important; max-height: min(65vh, 520px) !important; }`，且 `buildr-web` 与 `buildr-harness-web` 的 `shared.css`、`markdownDiagramSvg.ts`、`optional-preferences.ts` 保持一致。

## Risks / Trade-offs
- **原有 `.ac-stream` 浏览器测试期望大图内部可滚动**：现有 `markdown-overflow.test.ts` 的滚轮衔接用例直接在 `.ac-stream` 内构造超高已渲染图示。按新需求该用例场景会改为自适应无滚动条并直接滚动 `.ac-stream`，需将"内部局部滚动 + 滚轮边界衔接"测试迁移至非 `.ac-stream` 阅读容器（如 `.knowledge-reader-body`），并在 `.ac-stream` 内显式断言无滚动条且滚轮直接滚动信息流。
- **固有宽高属性对窄屏文档阅读区影响**：仅 `max-width: none` 下保留 `drawing.style.width = ${width}px`，而在 `.ac-stream` 中由 CSS `!important` 覆盖为 `auto` + `max-width/max-height` 等比缩小；文档阅读区未匹配 `.ac-stream` 规则，因此行为完全保留。
