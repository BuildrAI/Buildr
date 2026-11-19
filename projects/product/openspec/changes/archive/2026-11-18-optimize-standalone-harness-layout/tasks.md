## 1. 宿主契约与独立版状态约束

- [x] 1.1 在 `HarnessConversationHost` 增加 `standalone?: boolean`，并在 `conversation-state.ts` 实现 `resolveInitialStandaloneView` 与 `shouldPersistStandaloneHistoryPreference` 纯函数，使桌面宽屏默认返回 `'history'`、窄屏回退 `'conversation'` 且窄屏不覆盖桌面偏好（由 `test/ui/agent-conversations.test.mjs` 单元测试验证）。
- [x] 1.2 在 `AgentConversationsProvider` 与 `HarnessApp.tsx` 接入 `standalone` 模式：锁定 `open: true`、`full: true`、`side: 'left'`，使用独立偏好键 `buildr.harness-standalone.history-open:<profile>` 与会话存储兜底持久化桌面对话列表展开状态（由单元测试与浏览器刷新测试验证）。

## 2. 独立网页控制项与窄屏返回交互

- [x] 2.1 在 `ConversationPanel.tsx` 的主对话更多菜单过滤独立模式下的 `收起对话`、`专注对话`/`恢复分屏`、`对话移到最左侧`/`对话移到右侧` 及冗余分隔线，同时保持子对话浮窗的 `收起对话` 与 Buildr Development 菜单完整可用。
- [x] 2.2 在 `ConversationDock.tsx` 与 `ConversationDockSurface.tsx` 按 `!host.standalone` 控制左侧导轨“当前对话”气泡开关与预览行为，在独立版中仅保留新建对话、对话列表和设置入口。
- [x] 2.3 在 `ConversationHistory.tsx` 为独立版窄屏单栏视图（`standalone && !keepHistoryOpen`）显示标题栏左侧 `返回当前对话` 按钮，保持桌面并排分屏与 Development 固定侧栏不显示该按钮。

## 3. 测试更新、知识核对与直接验证

- [x] 3.1 在 `test/ui/agent-conversations.test.mjs` 新增独立版桌面默认列表与窄屏不覆盖偏好单测，并更新 `standalone.test.ts`、`focus-split-seen.test.ts`、`draft-list-calm.test.ts` 以验证默认并排打开、偏好持久化、菜单与导轨控制裁剪及窄屏返回入口。
- [x] 3.2 复核当前知识影响（确认 `knowledge/docs/architecture/harness-products.md` 与 `knowledge/code-map/harness-products.md` 保持 `aligned`），并运行 `buildr-harness-web` 构建、静态检查、单元检查及独立版与 Development 集成浏览器端到端检查。
