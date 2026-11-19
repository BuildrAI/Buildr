## 1. 解除通用功能模式门控与扩展公开宿主同步接口（`services/buildr-harness-web`）

- [x] 1.1 修改 `ConversationHistory.tsx` 与 `ConversationPanel.tsx`，移除 `focusNavigation` 属性：单栏覆盖列表（`!keepHistoryOpen`）统一展示“返回当前对话”按钮，非隐藏列表视图统一支持工作空间分组标题右侧快捷新建对话与无历史空间展示，点击历史行统一关闭设置。
- [x] 1.2 修改 `ConversationActivity.tsx` 与 `HarnessConversationSurface.tsx`，确保提醒打开对话、切换历史列表与外部命令（`open`/`new`/`history`）在分屏与专注模式下均自动关闭设置。
- [x] 1.3 扩展 `ConversationHost.tsx`、`ConversationDock.tsx` 与 `HarnessConversationSurface.tsx`，支持 `open`、`onOpenChange`、`onSideChange` 与 `onWidthChange` 的防回滚双向同步，并修复收起态点击“当前对话”、“新建对话”、“供应商额度”与“智能体与模型设置”的展开行为。
- [x] 1.4 调整 `conversation-surface.css` 与 `conversation-dock.css`，取消隐藏 `.ac-divider`，允许 `.harness-conversation-surface` 溢出呈现暂看浮层（Peek），并将 `.ac-panel.is-peeking` 的最大宽度改为 `calc(100vw - 88px)`、`z-index` 设为 `20`。

## 2. 移除 Development 外壳重复导轨、窄屏占位控制与分隔条（`services/buildr-web`）

- [x] 2.1 在 `AgentConversationsContext.tsx` 接入与持久化 key 对齐的 `side` 与 `width` 状态；在 `ConversationWorkspace.tsx` 移除 `.development-harness-rail` 与 `hidden={!context.open}`，向 `HarnessConversationSurface` 传递 `open` 与同步回调。
- [x] 2.2 在 `DevelopmentHarnessShell.tsx` 移除重复 `SplitDivider` 与本地宽度状态，直接消费上下文 `width` 与 `side` 控制左右停靠布局。
- [x] 2.3 在 `AppLayout.tsx` 移除 `.global-conversations-control` 窄屏占位顶栏，删除废弃文件 `services/buildr-web/src/features/harness-ui/ConversationActivity.tsx`，并同步更新 `development-harness-shell.css` 与 `harness-ui.css`（含左停靠桌面与窄屏横排导轨适配）。

## 3. 文档、规范边界与端到端验证

- [x] 3.1 更新 `knowledge/docs/architecture/harness-products.md` 与 `knowledge/docs/architecture/agent-integration.md`，记录单源导轨/分隔条边界与分屏复用原则。
- [x] 3.2 在 `services/buildr-harness-web/test/ui/static/host-boundaries.test.mjs` 增加静态防回归断言（禁止外壳重新复制 `.development-harness-rail` / `SplitDivider` / `ConversationActivity.tsx` 或在 `ConversationHistory.tsx` 重新引入 `focusNavigation`）。
- [x] 3.3 更新 `services/buildr/test/e2e/harness-frame.ts` 覆盖唯一分隔条、收起态完整导轨能力（角标、悬停额度概览、悬停暂看 Peek、点击直达额度）、分屏分组快捷新建与单栏返回、分屏左右停靠及外部导航自动关闭设置抽屉，并完成四服务 `test:static`、`test`、`harness-shell-composition`、`harness-standalone-browser` 与 `harness-frame-browser` 全量验证。
