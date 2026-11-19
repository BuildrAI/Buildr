## Context

详见 `proposal.md` 的动机与范围。当前 `buildr-harness-web` 同时服务两个产品场景：
- **Buildr Development**：通过 `DevelopmentHarnessShell` + `HarnessConversationSurface` 在工程页面同页装配对话侧栏（也兼容旧嵌入路径），用户可在分屏、专注模式、左右停靠与面板收起/展开之间切换。
- **独立版 Buildr Harness Web**（`9519` / `9518`）：由 `HarnessApp` 直接渲染，不装配工程宿主。此前由于共享 `AgentConversationsProvider`、`ConversationPanel` 与 `ConversationDockSurface`，独立版继承了 `buildr.agent-conversation.focus-history:<profile>` 偏好以及面对宿主分屏的菜单与导轨控制项。

## Goals / Non-Goals

**Goals:**
- 通过宿主契约信号 `HarnessConversationHost.standalone` 显式区分独立完整网页入口与宿主组合入口，消除隐式假定。
- 在独立版首次同步渲染时即锁定 `open: true`、`full: true`、`side: 'left'` 及对应的 `view`，并在交互过程中拒绝非法的收起、退回分屏或向右移栏操作。
- 桌面端独立网页默认展开左侧对话列表，持久化用户显式切换的列表开合状态，同时保持窄屏默认进入对话并提供明确的返回入口。
- 完整保留子对话浮窗自身收起入口、旧嵌入式 iframe 协议路径以及 Buildr Development 同页装配的全部现有交互与测试契约。

**Non-Goals:**
- 不修改 Buildr Development 自身的默认布局、分屏偏好或嵌入协议。
- 不改变后端会话控制、对话存储、历史分页或模型执行行为。
- 知识影响评估（`current-knowledge-maintenance`）：核对 `knowledge/docs/architecture/harness-products.md` 与 `knowledge/code-map/harness-products.md`，二者已准确说明独立网页与 Development 的职责分工（`HarnessApp.tsx`、公共宿主接口及组件装配边界），本次改动为独立网页外壳内既定职责的布局优化，现有知识文件保持 `aligned`，无需改写知识文档。

## Decisions

1. **通过 `HarnessConversationHost.standalone` 与 `AgentConversationsProvider` 的 `standalone` 参数显式声明独立模式，而非依赖 DOM 或样式隐藏**
   - 备选方案：仅在 `HarnessApp` 用 CSS 隐藏菜单项和导轨图标，并在 `useEffect` 里强制调用 `setOpen(true)` / `setFull(true)` / `setView('history')`。
   - 选择理由：CSS 隐藏会留下无障碍树噪声且无法阻止初始帧闪屏或旧 `focus-history` 写入污染；在语义与状态层显式约束 `standalone` 可以从首帧开始保持 `open`/`full`/`side`/`view` 一致，且通过纯函数覆盖桌面/窄屏计算规则。
   - 范围约束：`HarnessApp` 仅在非嵌套（`window.parent === window`）且未传入 `environment` 时启用 `standalone`；当将来接入可选工作环境或处于 Development 中时，自然保留宿主布局控制。子对话浮窗（`ConversationPanel` 传入 `embedded={true}`）始终以浮窗自身关闭逻辑运行，不视为顶层 `standalone` 面板。

2. **为独立版使用专用列表偏好键 `buildr.harness-standalone.history-open:<profile>`（及同标签页 `sessionStorage` 兜底 `buildr.harness-standalone.history-session:<profile>`）**
   - 备选方案：复用 `buildr.agent-conversation.focus-history:<profile>`。
   - 选择理由：历史实现中 `HarnessApp` 的初始化 `useEffect` 在首次打开独立页时调用 `context.setFull(true)` 会向 `focus-history` 写入 `'false'`，导致既有开发/发布浏览器配置域内已经残留了 `'false'`，从而使“桌面无偏好时默认展开”在现有用户浏览器中无法生效。同时分离独立版与 Development 专注模式的列表偏好，也避免两产品共享存储时互相改变各自心智模型。
   - 窄屏保护：只有在视口满足并排分栏条件（`canSplitFocusHistory`）或用户显式打开列表时才更新桌面偏好；窄屏打开页面自动落回 `'conversation'` 或点击“返回当前对话”时，不改写已保存的桌面偏好。

3. **窄屏对话列表标题栏补全 `返回当前对话` 入口**
   - 原实现中 `ConversationHistory` 仅在 `!context.open`（即面板未固定展开的暂看态）才显示标题栏左侧返回箭头，固定展开时依赖右侧导轨的“当前对话”气泡图标切回。
   - 独立版移除导轨气泡图标且 `context.open` 恒为 `true`，因此在 `standalone && !keepHistoryOpen` 时必须显示标题栏左侧 `返回当前对话` 按钮，而桌面并排分屏（`keepHistoryOpen === true`）与 Development 固定侧栏继续不显示该按钮。

## Risks / Trade-offs

- **既有独立版浏览器测试预期变化** → `buildr-harness-web/test/browser/` 中部分测试（如 `standalone.test.ts`、`focus-split-seen.test.ts`、`draft-list-calm.test.ts`）原先假设桌面进入独立网页时左侧列表关闭、并通过点击列表按钮再展开，还依赖下拉列表选项文本唯一性；实施中需同步更新这些测试以直接验证默认展开行为、隐藏/恢复偏好持久化与窄屏返回交互。
- **跨包构建产物同步** → `buildr-harness` 在测试和打包时消费 `buildr-harness/build/harness-web-dist` 中的静态产物，仅修改 `buildr-harness-web/src` 而未按顺序重建 `buildr-harness-web` 与 `buildr-harness` 会导致独立浏览器验证读到旧产物；需通过 `buildr-harness-web` 构建与 `buildr-harness` 重建或验证框架自动准备来保证一致。
