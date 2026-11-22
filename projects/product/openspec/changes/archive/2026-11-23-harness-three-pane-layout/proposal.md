## Why

独立版 Buildr Harness Web 在桌面端展开右侧对话工作区时存在两处交互瓶颈：
1. 右侧工作区采用固定百分比宽度（58%），未接入项目统一的可调宽度组件（`ResizablePanels` / `SplitDivider`），用户无法拖拽、键盘微调或双击复位工作区与对话区的宽度比例；此外组件层仍保留重复的 `src/components/SplitDivider.tsx`。
2. 右侧工作区展开后，对话主区域宽度在常规笔记本或 1440px 桌面视口下低于原双栏阈值（860px），导致左侧「对话列表」被迫折叠成单栏覆盖展示，无法与「核心对话信息流」和「右侧工作区」同屏并行浏览与协同调节。

详细需求上下文与完成依据见 [任务说明](@task/harness-three-pane-layout)。

## What Changes

- **统一可调宽度组件与分隔条收口**：
  - 将 `buildr-harness-web/src/components/SplitDivider.tsx` 统一转发至 `workbench/ui/SplitDivider.tsx` 并移除重复 CSS。
  - 为 `workbench/ui/ResizablePanels` 增加向后兼容的受控比例、拖拽过程/提交回调、容器轴尺寸观察与 `secondHidden` 隐藏能力（隐藏右侧面板时不卸载子组件且保持内部状态）。
  - `HarnessShell` 支持可选的 `resizable` 模式，并在桌面视口提供横向分栏、窄屏（<= 760px）自动切换为纵向上下分栏。
- **独立 Harness 三分屏布局与核心对话信息流宽度保护**：
  - 新增纯函数三栏布局求解模块 `src/shell/harness-layout.ts`，定义三栏并发阈值（1172px：52px 导轨 + 240px 对话列表 + 520px 核心信息流 + 360px 工作区）。
  - 在 `HarnessApp`、`ConversationHost`、`ConversationPanel`、`ConversationDock` 和 `AgentConversationsContext` 中接入三栏协同宽度协调：无论拖拽左侧列表分隔条还是右侧工作区分隔条，均优先保证核心对话信息流 >= 520px，仅在信息流触底时平滑推挤相邻非当前面板至其下限；在缩小某侧面板时保留相邻面板宽度不变、将释放空间优先分配给核心对话信息流。
  - 进入全屏设置时临时隐藏已展开的工作区并在关闭设置后原样恢复；视口窄于三栏阈值时自动平滑退回双栏并保护桌面偏好不被覆盖；工作区缩窄时文件树与阅读区通过容器查询自适应而不互相挤压。
- **不改变既有边界**：Buildr Development 同页装配（`DevelopmentHarnessShell`）、非工作区双栏专注模式以及既有后端接口契约保持不变。

## Capabilities

### New Capabilities
- 无新增独立 capability。

### Modified Capabilities
- `harness-web-composition`：补充独立 Harness 外壳展开工作区时复用统一可调宽度组件、桌面三分屏并行调节、核心对话信息流最小宽度保护、全屏设置期间临时隐藏工作区及窄屏偏好保护要求。
- `harness-directory-workbench`：补充对话工作区在独立 Harness 中接入统一可调宽度组件、在三分屏下与对话列表和对话内容并行展示及窄宽度自适应要求。

## Impact

- 源码影响：`projects/product/services/buildr-harness-web/src/`（`workbench/ui/`、`components/`、`shell/`、`integration/`、`features/agent-conversations/`、`features/directory-workbench/`、`HarnessApp.tsx`）。
- 产物与验证：`buildr-harness-web` 构建输出同步更新 `buildr-harness/build/harness-web-dist/`；新增三栏布局单元测试，并扩展外壳组件集成测试及独立浏览器 E2E 验收测试。
- 知识资产影响（`current-knowledge-maintenance`）：核对 `projects/product/knowledge/docs/architecture/harness-products.md` 与 `projects/product/knowledge/code-map/harness-products.md`，均已准确描述 `HarnessApp.tsx`、`HarnessDirectoryWorkbench.tsx` 与公开组合入口职责边界，本次优化属于独立网页外壳与通用工作台既定职责内的交互增强，现有知识文档保持 `aligned`。
