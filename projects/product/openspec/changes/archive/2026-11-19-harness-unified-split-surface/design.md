## Context

`buildr-web` 已通过 `HarnessConversationSurface` 同页挂载 `buildr-harness-web` 完整对话表面，但此前存在两类边界错位：
1. **将布局模式当成功能开关**：`ConversationPanel` 仅在 `focusSettings`（专注或独立模式）传出 `focusNavigation`，导致 `ConversationHistory` 仅在该条件下启用工作空间分组标题新建按钮（`onNew`）、保留空工作空间及点击行关闭设置；同时 `ConversationHistory` 以 `!context.open || standalone || focusNavigation` 判断返回按钮，遗漏了非 `keepHistoryOpen` 的分屏展开态；`HarnessConversationSurface` 仅在 `context.full` 下处理外部命令自动关闭设置。
2. **宿主层复制第二套外围控件**：`ConversationWorkspace` 在 `!context.open` 时隐藏整个 `HarnessConversationSurface` 并渲染静态 `.development-harness-rail`，`AppLayout` 在窄屏额外渲染 `.global-conversations-control`（含占位 `ConversationActivity.tsx`），`DevelopmentHarnessShell` 维护另一套 `.development-harness-divider` 与宽度存储；而 `.harness-conversation-surface` 隐藏了内层 `.ac-divider` 且外层未消费 `side`，致使分屏收起态丢失动态浮窗/角标/暂看功能，“对话移到最左侧/右侧”也无法移动面板。

## Goals / Non-Goals

**Goals:**
- **能力单一实现**：所有对话、对话列表、导轨入口、悬停浮窗/暂看预览与分屏宽度分隔条只保留在 `buildr-harness-web` 唯一实现中。
- **自适应不阉割**：双栏并排/单栏切换只由容器是否满足 `keepHistoryOpen`（宽屏专注/独立并排）决定；设置主区平铺/抽屉只由 `focusSettings` 决定；所有交互能力在分屏与专注模式全量保留。
- **宿主只管外壳协作**：`buildr-web` 仅维护展开/收起状态、分屏总宽度与工程区左右位置、专注模式切换以及工程文件/任务/工作上下文插槽，不复制任何导轨或分隔条。

**Non-Goals:**
- 不改变独立 Harness 网页的目录添加器、无宿主禁用折叠行为及桌面默认展开列表偏好；
- 不将工程任务关联或文件浏览器逻辑迁入 `buildr-harness-web`。

## Decisions

1. **清除 `focusNavigation` 门控并统一单栏返回与设置自动关闭**（`ConversationHistory`、`ConversationPanel`、`ConversationActivity`、`HarnessConversationSurface`）：
   - `ConversationHistory` 移除 `focusNavigation` 属性，改为：所有非并排列表（`!keepHistoryOpen`）均在标题栏呈现“返回当前对话”；所有非隐藏列表视图（`!hidden`）均渲染工作空间分组快捷新建（`onNew`）与空工作空间占位以便直接从空间发起新对话；点击历史行、列表分组新建、提醒项打开或外部指令 `open`/`new`/`history` 均无条件关闭设置（无论主区设置还是抽屉设置）。
2. **单源导轨常驻挂载并向宿主双向同步 `open`/`full`/`side`/`width`**（`HarnessConversationSurface`、`ConversationDock`、`ConversationHost`）：
   - `buildr-web` 在收起态不再隐藏 `HarnessConversationSurface`，只给外框加 `.is-collapsed` 并将外壳 `harness-conversation-region` 设为 `52px` 导轨宽度，使 Harness 内唯一的 `.ac-collapsed-rail` 直接在收起态保持活跃，提供活动角标、悬停“对话提醒”浮窗、悬停“供应商额度”概览及悬停“当前对话”暂看面板（`.ac-panel.is-peeking` 使用 `max-width: calc(100vw - 88px)` 与 `z-index: 20`，`conversation-surface` 设为 `overflow: visible` 以防被 `52px` 区域裁切）。
   - `HarnessConversationSurface` 增加 `open`、`onOpenChange`、`onSideChange`、`onWidthChange` 公开属性；`Surface` 内用成对的 `prevProp` / `prevContext` ref 区分“宿主改 props”与“内层导轨点击改变上下文”两类变更发起方，防止状态反向回滚（替代方案：把 `open`/`side`/`width` 全部改为只读 props 并在 `buildr-web` 重写状态逻辑，会重新把导轨和分隔条状态分散回宿主）。
   - 修复 `ConversationDock` 收起态点击动作：点“当前对话”展开并切至 `conversation` 视图；点“新建对话”展开并保留/创建新草稿；点“供应商额度”与“智能体与模型设置”时若面板收起则先展开再打开对应抽屉页签。
3. **删除宿主重复导轨、窄屏占位入口与重复分隔条，接通分屏左右停靠**（`ConversationWorkspace`、`DevelopmentHarnessShell`、`AppLayout`）：
   - 移除 `.development-harness-rail`、`.development-harness-divider`（以及 `SplitDivider` 调用）和 `.global-conversations-control` + `ConversationActivity.tsx`。
   - 取消 `conversation-surface.css` 对 `.ac-divider` 的隐藏；`DevelopmentHarnessShell` 从 `AgentConversationsContext` 读取同步来的 `width` 与 `side`，在 `side === 'left'` 时将 `.harness-shell-body` 从 `row-reverse` 切换为 `row`，使分屏菜单“对话移到最左侧 / 对话移到右侧”真实生效，同时保持窄屏（`<= 760px`）纵向排布及导轨横排自适应。

## Risks / Trade-offs

- **Props 与内层状态的双向同步竞态** → 通过区分 `prevProp` 与 `prevContext` ref 在 `useLayoutEffect` 中仅向相反方向传播单次增量，并确保宿主先收到状态展开再处理 `command`，通过 `harness-frame-browser` 覆盖展开、收起、暂看、专注切换及刷新恢复测试。
- **收起态窄容器裁切 Peek 与分隔条越界** → 将 `.harness-conversation-region`、`development-harness-frame` 与 `.harness-conversation-surface` 保持 `overflow: visible`，将 Peek 最大宽度锚定为 `100vw - 88px` 并在移动端显式覆盖左停靠流向，避免小屏排版错乱。
- **已有外部/测试选择器变更** → 去掉 `.development-harness-rail` 与 `.development-harness-divider` 后，所有导轨交互统一走 `.ac-collapsed-rail`；同步更新静态防回归检查与 `harness-frame.ts`。
