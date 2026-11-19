## Why

近期为独立 Buildr Harness 与 Development 专注模式新增的前端交互（例如工作空间分组快捷“新建对话”、空工作空间保留展示、单栏列表“返回当前对话”及导航时自动关闭设置）误用 `focusNavigation` / `focusSettings` / `context.full` 等布局标记做功能门控，且 Development 外壳另行实现了收起态静态导轨（`.development-harness-rail`）、窄屏占位对话控制条（`.global-conversations-control` + `ConversationActivity`）与第二套分屏分隔条（`.development-harness-divider`）。这导致新增的 Harness 通用能力在分屏与收起态缺失，且每增改导轨或列表功能都不得不在两侧重复实现。

## What Changes

- **解除 Harness 通用能力的模式门控**：`ConversationHistory`、`ConversationPanel`、`ConversationActivity` 与 `HarnessConversationSurface` 移除 `focusNavigation` 及仅限专注模式的设置自动关闭限制；工作空间分组右侧快捷“新建对话”、无历史工作空间展示、非并排单栏列表的“返回当前对话”入口，以及选对话/新建对话自动关闭设置在分屏模式与专注/独立模式一致生效。
- **由 Harness 唯一提供侧边导轨与分屏分隔条**：`ConversationDock` 与 `HarnessConversationSurface` 向装配宿主开放并双向同步 `open`、`full`、`side` 与 `width` 状态，同时修复收起态下点击“当前对话”、“新建对话”、“供应商额度”与“智能体与模型设置”的展开行为，并将暂看浮层（Peek）与分隔条调整为可跨窄收起容器完整显示。
- **移除 Development 外壳重复实现**：`buildr-web` 删除收起态静态导轨 `.development-harness-rail`、窄屏重复占位顶栏 `.global-conversations-control`（含 `ConversationActivity.tsx`）与重复分隔条 `.development-harness-divider`，让收起态直接复用 Harness 唯一导轨（获得未读/待处理角标、悬停“对话提醒”浮窗、悬停“供应商额度”概览及悬停“当前对话”暂看预览）；`DevelopmentHarnessShell` 改为直接消费 Harness 同步的 `width` 与 `side`，使菜单“对话移到最左侧 / 对话移到右侧”真正移动整个分屏面板。
- **更新规范、文档与回归测试**：同步 `harness-web-composition` 与 `model-usage-controls` 规范、架构文档，并补充静态防回归检查与 `harness-frame-browser` 端到端断言。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `harness-web-composition`: 明确 Development 外壳不得复制第二套导轨、窄屏控制或分屏分隔条；Harness 通用对话、列表与导轨能力不得以专注/分屏模式作为功能门控，收起态复用唯一导轨并双向同步开合、宽度与左右停靠。
- `model-usage-controls`: 将 Development 分屏收起态的独立供应商额度入口统一至 Harness 唯一导轨，在收起态同样支持悬停或键盘聚焦显示额度概览，点击展开分屏并直达全部供应商“账号与额度”页签。

## Impact

- 前端实现：`services/buildr-harness-web`（`ConversationHistory`、`ConversationPanel`、`ConversationActivity`、`ConversationDock`、`ConversationHost`、`HarnessConversationSurface`、`conversation-surface.css`、`conversation-dock.css`）与 `services/buildr-web`（`AgentConversationsContext`、`ConversationWorkspace`、`DevelopmentHarnessShell`、`AppLayout`、`development-harness-shell.css`、`harness-ui.css`，删除 `ConversationActivity.tsx`）。
- 文档与验证：`knowledge/docs/architecture/harness-products.md`、`knowledge/docs/architecture/agent-integration.md`、`services/buildr-harness-web/test/ui/static/host-boundaries.test.mjs`、`services/buildr/test/e2e/harness-frame.ts`。
- 兼容影响：独立 Harness 网页外观与交互不变；Development 收起态图标功能增强，取消外壳内部重复 DOM 类名与占位文件。
