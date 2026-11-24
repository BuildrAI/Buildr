## 1. 统一可调宽度组件与布局求解

- [x] 1.1 将 `src/components/SplitDivider.tsx` 转发到 `src/workbench/ui/SplitDivider.tsx` 并删除冗余 `src/components/split-divider.css`，通过 `npm run typecheck` 与 `test/ui/static/*.test.mjs` 验证分隔条单一实现与宿主边界保持有效。
- [x] 1.2 为 `src/workbench/ui/ResizablePanels.tsx` 与 `resizable-panels.css` 增加受控比例、`secondHidden`、`onRatioChange`、`onAxisSizeChange`、`onDragChange` 与 `moved` 点击保护，并通过已有单测/类型检查验证非受控调用兼容性。
- [x] 1.3 新建纯函数模块 `src/shell/harness-layout.ts` 实现三栏尺寸阈值、布局解析与双向协同推挤算法，并在 `test/ui/harness-three-pane-layout.test.mjs` 通过全部单元测试用例。

## 2. 外壳分栏、三栏协作协议与紧凑样式

- [x] 2.1 更新 `src/shell/HarnessShell.tsx` 与 `harness-shell.css` 支持可选 `resizable` 模式并保持工作区开关不卸载对话树，并在 `test/shell/composition.test.ts` 验证拖拽、键盘、双击复位、窄屏切换与 DOM 稳定性。
- [x] 2.2 更新 `src/integration/ConversationHost.tsx`、`src/HarnessApp.tsx`、`ConversationPanel.tsx`、`ConversationDock.tsx`、`AgentConversationsContext.tsx` 接入三栏协同控制、全屏设置期间临时隐藏工作区、以及切换/新建对话列表状态保留。
- [x] 2.3 优化 `conversation-dock.css` 与 `directory-workbench.css` 在三栏与窄工作区宽度下的内边距及文件树容器查询自适应。

## 3. 构建、浏览器验证与知识核对

- [x] 3.1 扩展 `test/browser/directory-workbench.test.ts`，在真实托管产物与独立浏览器中验证三栏并发、双分隔条拖拽边界、核心对话信息流 >= 520px 保护、全屏设置恢复与窄视口退化恢复。
- [x] 3.2 核对 `knowledge/docs/architecture/harness-products.md` 与 `knowledge/code-map/harness-products.md` 与实现及规范保持一致，无需额外新建或改写知识文档。
- [x] 3.3 完成 `buildr-harness-web` 与 `buildr-web` 构建、类型检查及全部静态/单元/外壳集成/浏览器端到端检查，确保无回归。
