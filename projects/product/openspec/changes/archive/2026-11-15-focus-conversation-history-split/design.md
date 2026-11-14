## Context

见 `proposal.md` 动机说明。Buildr Web 的对话面板（`ConversationPanel`）此前在专注模式（`context.full === true`）下通过绝对定位浮层 `.ac-history-drawer`（`width: min(420px, 100%)`）叠加显示 `ConversationHistory`，且选定对话后 `openConversation` 会将 `view` 重置为 `'conversation'` 导致列表收起。

## Goals / Non-Goals

**Goals:**
- 在具备并排空间的桌面视口中，专注模式的对话列表改为面板内左侧可拖拽分屏，与右侧对话详情并排呈现。
- 严格保护右侧对话详情宽度（优先保证完整 `800px` 最大阅读宽度不被压缩），将左侧列表限制在紧凑且可控的宽度范围内。
- 点击列表切换对话或点击导轨新建对话时保持左栏常驻；退出专注模式回到当前对话视图；窄窗口自动降级为单栏替换。

**Non-Goals:**
- 不改变普通分屏模式、悬停活动浮窗与手机端全局入口布局。
- 不修改服务端对话分页、排序、搜索接口。
- 不越权修改 `projects/product/knowledge/`；已识别的知识校准项单独反馈给用户决定。

## Decisions

### 1. 左栏尺寸边界与“保护右侧最宽阅读区”约束
- **取值选择**：最小宽度 `300px`、默认宽度 `340px`、硬上限 `420px`；右侧完整阅读宽度基线 `800px`（`--ac-content-width`），窄并排保底宽度 `560px`（常规对话面板最小宽度）。
- **动态上限公式**：`focusHistoryMaxWidth(panelWidth) = Math.max(300, Math.min(420, Math.floor(panelWidth - 800)))`。
  - 在 `panelWidth >= 1100px`（桌面常见窗口 `>= 1152px`）时，左栏最多只能拖到 `panelWidth - 800px` 且不超过 `420px`，右侧 `.ac-conversation-view` 始终保有至少 `800px`，保证消息流与输入区宽度完全不受左栏影响。
  - 在 `860px <= panelWidth < 1100px`（紧凑桌面窗口）时，左栏自动钳制到 `300px`，把剩余全部宽度（`560px–799px`）让给右侧对话。
  - 当 `panelWidth < 860px` 或移动端视口（`viewportWidth <= 760px`）时，`canSplitFocusHistory` 返回 `false`，退回面板内单栏切换，避免双栏同时挤压失效。
- **持久化策略**：用户拖拽/键盘微调/双击恢复的偏好写入独立键 `buildr.agent-conversation-history-width`；窗口临时缩放只实时钳制渲染宽度，不覆盖用户保存的偏好值。
- **替代方案及放弃理由**：若按纯百分比（如固定最大 `45%`）限制左栏，中等窗口（如 `1160px`）下左栏 `45%` 会占走 `522px`，把右侧压到 `638px` 从而直接压缩用户要求保护的 `800px` 对话内容区；采用 `panelWidth - 800` 动态上限可在不挤压右侧的前提下给出最大合理空间。

### 2. 并排布局结构与局部弹层归属
- 沿用现有 `view: 'conversation' | 'history'` 状态表达专注左栏显隐，不新增并行视图状态；当 `focusSplit && view === 'history'` 时，`.ac-panel.is-full` 横向排列 `[.ac-focus-history-pane] + [SplitDivider] + [.ac-conversation-view]`。
- `ConversationDockSurface` 通过 `cloneElement(panel, { ref: pane })` 持有面板节点引用；为避免覆盖该引用，`ConversationPanel` 通过 `panelId` 配合 `ResizeObserver` 与窗口尺寸监听测量面板可用宽度。
- 将交接内容抽屉（`ConversationHandoffDrawer`）和重命名弹窗（`Modal getContainer={false}`）移入带 `position: relative` 的 `.ac-conversation-view` 内，使其局部覆盖右侧详情而不遮挡左栏列表。

### 3. 切换、新建与退出专注的视图流转
- 专注分屏下点击列表条目或导轨 `+` 新建对话时，通过可选标志 `preserveHistoryView` 保持 `view === 'history'`；新草稿首次发送创建对话时（`create`）若处于 `full` 模式也保留当前 `view`。
- 专注模式下点击导轨 `☰ 对话列表` 切换左栏开关；左栏展开时点击导轨 `💬 当前对话` 仅收起左栏回到单对话专注；离开专注模式（`setFull(false)`）同步把 `view` 归位为 `'conversation'`。

### 4. 列表行在 300px 左栏下的文本截断
- 列表行底部存在 UUID 标识（`.ac-history-id`）与时间/状态元信息（`.ac-history-meta`），在 `300px` 左栏下 `flex: none` 的完整 UUID 易造成行内溢出。当存在非空元信息时给 `.ac-history-id` 约束 `max-width: calc(100% - 36px)`，宽屏继续完整显示 UUID，窄左栏下自然省略且无横向滚动条。

### 5. 当前知识影响评估
- 按 `current-knowledge-maintenance` `assess` 核对：`projects/product/knowledge/code-map/technical-layers.md` 第 61 行描述“专注模式下对话历史以面板内左侧临时栏叠加呈现”，需同步校准为“专注模式下桌面宽屏在左侧以可拖拽限宽分屏并排展示且不压缩右侧正文宽度，窄屏退回单栏切换”。当前授权范围仅包含方案与前端实施，未包含知识库修改授权，将在验收汇报中作为 `attention` 提醒用户确认是否一并更新。

## Risks / Trade-offs

- **旧单栏断言差异** → 现有浏览器测试 `history/focus-mode-drawer` 与目录文案依赖原临时浮层与点击即关语义；将同步更新该场景测试专注并排、限宽拖拽、右侧不压缩、切换常驻与降级。
- **中等宽度拖拽上限收窄** → 在 `1100px` 左右窗口下左栏最高只能拖到 `300px–348px`；这是严格满足“不压缩右侧 `800px` 对话区”的必然取舍，可通过在拖拽分隔条悬停提示或最大宽度内灵活调整满足日常浏览。
