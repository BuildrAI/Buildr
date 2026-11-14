## Why

当前对话专注模式（`is-full`）下，点击左侧导轨的「对话列表」入口会以绝对定位浮层（`.ac-history-drawer`）覆盖在对话详情上方，且选择其他对话后列表会自动关闭。当用户需要一边浏览对话列表一边连续切换查看多段对话时，浮层既会遮挡左侧内容又无法拖拽调宽，还缺乏“保持右侧对话阅读区最宽不被压缩”的宽度保护机制。相关需求背景与验收依据见 [任务说明](@task/focus-conversation-history-split)。

## What Changes

- 将桌面端对话专注模式下展开的「对话列表」由绝对定位覆盖层改为与右侧对话详情并排展示的可调整宽度分屏栏（左栏对话列表 + 中间共享 `SplitDivider` 分隔条 + 右栏对话详情）。
- 左栏支持鼠标拖拽、键盘微调及双击恢复默认宽度，并将宽度严格限制在合理上下界与动态上限内，优先保障右侧对话详情始终保持最宽阅读区（`800px`）不被压缩；拖拽宽度偏好持久化到本地可选偏好中。
- 在桌面专注分屏下点击对话列表切换对话或点击导轨新建对话时，保持左侧对话列表展开并更新右侧内容；再次点击列表入口或导轨当前对话入口收起左栏；退出专注模式时回到当前对话的分屏视图。
- 窄屏或窗口宽度不足以并排分屏时，退回面板内单栏替换显示且不产生横向溢出；局部交接抽屉与重命名弹窗归属于右侧对话详情区域，不遮挡左栏。
- 本变更为交互增强，无破坏性外部接口或数据格式变更（**非破坏性变更**）。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `buildr-web-client`: 修订“对话面板必须与原工作双屏独立共存”中关于专注模式对话列表的展示形态、宽度受限拖拽、右侧阅读宽度保护及切换常驻行为。

## Impact

- 规范：`projects/product/openspec/specs/buildr-web-client/spec.md`
- 前端实现：`projects/product/services/buildr-web/src/features/agent-conversations/`（`conversation-state.ts`、`AgentConversationsContext.tsx`、`ConversationHistory.tsx`、`ConversationDock.tsx`、`ConversationPanel.tsx`、`agent-conversations.css`、`conversation-dock.css`）
- 自动化测试：`projects/product/services/buildr-web/test/agent-conversations.test.mjs`、`projects/product/services/buildr-web/test/browser/agent-conversation-history-catalog.ts`、`projects/product/services/buildr-web/test/browser/agent-conversations-history-scenarios.ts`
- 当前知识影响：`projects/product/knowledge/code-map/technical-layers.md` 第 61 行对专注模式“左侧临时栏叠加呈现”的描述需同步关注校准（本次未获知识修改授权，按提醒保留）。
