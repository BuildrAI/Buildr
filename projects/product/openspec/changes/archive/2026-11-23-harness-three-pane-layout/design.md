## Context

详见 `proposal.md` 的背景说明。当前 `buildr-harness-web` 中：
- 右侧工作区由 `HarnessShell` 渲染，通过固定 CSS `flex: 0 0 58%` 控制尺寸，缺少与 `SourceControlWorkbench`、`MySqlQuery` 共用的 `ResizablePanels` / `SplitDivider` 调节能力；同时 `src/components/SplitDivider.tsx` 与 `src/workbench/ui/SplitDivider.tsx` 存在重复代码与重复样式表。
- 独立网页中 `ConversationPanel` 使用面向全屏双栏专注模式的阈值 `FOCUS_SPLIT_MIN_PANEL_WIDTH = 860`（300 + 560）。当右侧工作区占用约 40%–58% 视口宽度时，`panelWidth` 降至 `600–820px`，导致左侧对话列表即便在 1440px–1600px 宽屏下也退回单栏覆盖切换。

## Goals / Non-Goals

**Goals:**
- 将全站 `SplitDivider` 收口到单一实现，并使 `HarnessShell` 的工作区展开直接复用 `ResizablePanels` + `SplitDivider`。
- 在独立 Harness 桌面视口（>= 1172px）支持「左侧对话列表 + 中间核心对话信息流 + 右侧工作区」三栏同时展开与宽度调节，且在任何交互与缩放下硬性保护核心对话信息流 >= 520px。
- 保持 Buildr Development 同页装配（`DevelopmentHarnessShell`）及未开工作区时双栏专注模式的既有常量、契约、菜单与偏好隔离完全不变。

**Non-Goals:**
- 不修改 Buildr Development 宿主分栏（`ConversationDock` 与 `.ac-divider`）行为或尺寸规则。
- 不改变后端工作台/对话 API 或引入新的持久化数据库。

## Decisions

1. **统一分隔条并扩展 `ResizablePanels` 承接外层工作区协调**
   - **选定方案**：将 `src/components/SplitDivider.tsx` 转发到 `src/workbench/ui/SplitDivider.tsx` 并移除冗余 CSS；在 `ResizablePanels` 中新增向后兼容的可选属性（`secondHidden`、`ratio`、`onRatioChange`、`onAxisSizeChange`、`onDragChange`），并通过 `moved` 标志避免单纯点击分隔条时误触发保存。
   - **备选方案**：在 `HarnessShell` 中手写一套独立的指针拖拽与 `SplitDivider` 逻辑。
   - **理由**：复用并扩展 `ResizablePanels` 符合“右边工作区展开支持可改变宽度的统一组件”的要求，同时天然具备指针捕获、键盘微调（方向键 / `Home` / `End`）、双击重置与双向 `ResizeObserver` 尺寸测量能力；已有 `SourceControlWorkbench` 和 `MySqlQuery` 不传入新可选 prop，行为完全保持非受控兼容。
   - **DOM 稳定性保证**：`HarnessShell` 在 `resizable` 模式下始终保持 `<ResizablePanels>` 作为稳定树骨架，仅切换 `secondHidden={!open}`，确保展开/收起工作区或切换内容时不会卸载对话输入区或丢失草稿与滚动位置。

2. **通过纯函数求解器 `harness-layout.ts` 与可选宿主协调通道实现三栏协同**
   - **选定方案**：新增零 UI 依赖的 `src/shell/harness-layout.ts`，统一定义三栏维度常量与计算函数，并通过 `HarnessConversationHost.threePane` 将实时工作区协同状态注入 `ConversationPanel` 与 `ConversationDock`。
   - **关键参数与阈值**：
     - 导轨宽度：`52px`；移动端单栏断点：`760px`。
     - 核心对话信息流最小保护宽度：`520px`（`THREE_PANE_FEED_MIN_WIDTH`），在保证输入框两排工具栏舒适不折行与 Markdown/代码块阅读宽度的同时，使 `1200px` 级笔记本即可开启三分屏。
     - 三分屏下左侧对话列表：`min = 240px`、`default = 280px`、`max = 420px`。
     - 右侧工作区：`min = 360px`（确保资源管理器目录树与预览区可用）；默认对话区域占比 `0.60`（工作区占 `40%`）。
     - 最低三栏并行阈值：`52 + 240 + 520 + 360 = 1172px`（`< 1172px` 但 `> 760px` 时退回保留核心信息流 >= 520px 与工作区的双栏并排；`<= 760px` 切换上下布局，不破坏桌面列表展开偏好）。
   - **协同推挤策略（优先保中间）**：
     - 拖拽左侧对话列表分隔条向右推宽时，若核心信息流仍有余量（`> 520px`），仅缩小核心信息流而保持右侧工作区不动；触及 `520px` 后才推挤右侧工作区直至 `360px` 硬边界。向左缩窄列表时，释放空间全数归还核心信息流，右侧工作区保持不变。
     - 拖拽右侧工作区分隔条向左拉宽工作区时，若核心信息流 `> 520px`，仅缩小核心信息流而保持左侧列表不动；触及 `520px` 后才压缩左侧列表直至 `240px` 硬边界。向右收缩工作区时，左侧列表保持稳定不跳动，释放空间优先归还核心信息流。
     - 单次指针拖拽期间以起手瞬间快照为基准，使用户拖过头后再拖回时能够顺滑恢复原有相邻面板宽度。
   - **双栏专注模式兼容性**：未开工作区时，`ConversationPanel` 与 `conversation-state.ts` 继续沿用既有的 `300/340/420` 与 `860px` 双栏规则，现有所有单测与行为不受任何影响；三分屏偏好独立存储在 `buildr.harness-shell.workspace-ratio:<profile>` 与 `buildr.harness-three-pane.history-width:<profile>`。

3. **全屏设置与窄宽度工作台保护**
   - 在 `HarnessApp` 中令 `effectiveEnvironmentOpen = environmentOpen && !context.settings`，进入全屏设置时同步隐藏右侧工作区及分隔条并保留挂载现场，退出设置（关闭按钮 / `Escape` / 左导轨导航）后自动原样恢复。
   - 为 `.harness-directory-workbench` 启用 `container-type: inline-size`，在工作区宽度 <= 560px 时通过容器查询约束 `.repository-browser-tree` 不超过 `44%`，防止窄工作区下文件树挤压预览区域。

## Risks / Trade-offs

- **旧静态资产与跨包消费滞后** → 修改 `buildr-harness-web/src` 后须及时运行 `npm run build` 更新 `buildr-harness/build/harness-web-dist`，并在 E2E 测试前校验构建产物。
- **拖拽边界竞态或非位移点击误提交** → `ResizablePanels` 与 `ConversationPanel` 均通过 `moved` 标志区分单纯点击与真实拖拽，且拖拽中仅按起点快照计算并仅在释放指针/键盘确认/双击复位时持久化写入偏好。
- **既有测试与宿主边界契约** → 已核对 `test/ui/static/host-boundaries.test.mjs` 与 `test/ui/focus-settings-layout.test.mjs` 的代码正则约束：`HarnessShell` 不导入 `features/`、`ConversationPanel` 保留 `!showFocusSettings&&<SplitDivider` 语法结构、独立浏览器测试禁止引入 Vite dev server。
- **知识影响评估（`current-knowledge-maintenance`）**：经核对 `knowledge/docs/architecture/harness-products.md` 与 `knowledge/code-map/harness-products.md`，当前文档已准确概括独立网页与 `HarnessDirectoryWorkbench` 的职责边界，本次优化不改变跨产品分工或接口权威，现有知识文档保持 `aligned`。
