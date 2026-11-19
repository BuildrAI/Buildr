## Context

Buildr Harness 与 Development 专注模式已在 `ConversationDock` 与 `ConversationDockSurface` 中拆出独立的 `AccountQuotaButton`（`dedicated` 形态）与齿轮设置入口，并在上下文提供了直达“模型 → 全部供应商 → 账号与额度”页签的导航动作 `openQuotaSettings`。普通分屏此前因 `focusSettings` 门控仍把额度概览合并在齿轮入口上，且 Development 对话收起态导轨 `.development-harness-rail` 仅渲染齿轮设置按钮。

## Goals / Non-Goals

**Goals:**
- 在不改变分屏设置抽屉载体、不新增后端接口与副作用的前提下，使 Development 普通分屏展开态与收起态的独立额度入口行为与独立 Buildr Harness 及专注模式完全一致。
- 保持 `buildr-web` 与 `buildr-harness-web` 的公开装配边界，只通过 `buildr-harness-web/src/conversation` 暴露的 `HarnessConversationCommand` 通信。

**Non-Goals:**
- 不将普通分屏设置抽屉改为主区呈现，也不重构收起态导轨的移动端横排整体布局或增加悬停请求逻辑。

## Decisions

1. **展开态导轨统一渲染独立额度按钮**：`ConversationDock` 取消以 `focusSettings` 决定是否拆出独立额度按钮，始终向 `ConversationDockSurface` 传递 `quotaEntry={<AccountQuotaButton dedicated/>}`、`onQuota={context.openQuotaSettings}` 与显式 `focusSettings` 标记。`focusSettings` 仅用于控制主区设置渲染及齿轮按钮的聚焦标识（`id="agent-focus-settings-entry"`）与开关按下态（`aria-pressed`），避免与抽屉模式混淆（替代方案：另传一套分屏专属按钮组件，但会制造重复交互状态）。
2. **按停靠方位调整额度概览弹出方向**：`AccountQuotaButton` 根据上下文 `full` 与 `side` 选择浮层位置：`full || side === 'left'` 使用 `topLeft`，右停靠普通分屏使用 `topRight`，使浮层紧贴右侧导轨向左展开，防止右侧边缘被视口裁切（替代方案：固定 `topLeft`，在右停靠窄视口下容易向右偏移并依赖碰撞翻转）。
3. **收起态导轨通过公开指令透传额度直达动作**：在 `HarnessConversationCommand['action']` 扩展 `'quota'`，由 `HarnessConversationSurface` 转发至内部 `context.openQuotaSettings?.()`；`buildr-web` 的 `AgentConversationsContext` 提供 `openQuotaSettings()`（展开分屏并发送 `quota` 指令），`ConversationWorkspace` 在 `.development-harness-rail` 的设置按钮上方增加对应“供应商额度”按钮与样式，不直接导入 `buildr-harness-web` 内部组件（替代方案：直接引用 `AccountQuotaButton`，但会破坏 `host-boundaries` 跨服务边界）。

## Risks / Trade-offs

- **既有测试与文档预期变更** → 分屏模式齿轮不再触发额度浮层、展开态与收起态均新增独立额度按钮；同步更新架构说明与 `harness-frame.ts` 端到端断言并全量执行，确保所有消费者一致。
- **跨服务装配边界与样式同步** → 收起态导轨按钮处于 `buildr-web` 宿主层，与 `buildr-harness-web` 共享图标样式分开维护；通过补齐桌面与窄视口样式及跨服务边界检查降低回归风险。
