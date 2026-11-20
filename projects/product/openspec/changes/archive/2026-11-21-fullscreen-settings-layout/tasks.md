## 1. 归入确认原型与规范同步

- [x] 1.1 将临时讨论阶段已确认的原型副本归入 `openspec/changes/fullscreen-settings-layout/prototypes/settings-layout-prototype.html` 并核对发现标记与体积，清理临时原型目录与旧预览进程

## 2. 前端设置布局、导轨交互与文案改造

- [x] 2.1 更新 `ConversationPanel.tsx` 与 `conversation-dock.css`，在全屏设置打开时隐藏桌面分栏对话列表与宽度分隔条且不改写展开偏好、宽度与草稿，并核对关闭后恢复可见
- [x] 2.2 更新 `ConversationDock.tsx`、`ConversationDockSurface.tsx`、`ConversationActivity.tsx` 与 `AccountQuotaButton.tsx`，将设置入口标签收口为「设置」，并确保设置期间左导轨“当前对话”“对话列表”及高亮状态切换正确
- [x] 2.3 改造 `AgentModelSetup.tsx`、`AgentConnectionSettings.tsx` 与 `focus-settings.css`，实现保留左导轨的两级左侧导航全屏设置（一级分类不含右箭头、模型二级栏独立滚动、单栏贴左限宽、顶栏路径与右上角关闭、`Esc` 退出、窄屏自适应），并将全屏与分屏抽屉标题统一收口为「设置」
- [x] 2.4 同步更新 `ConversationConnectionNotice.tsx`、`conversation-notices.ts` 与 `buildr-harness` 应用内提及旧标题「智能体与模型」的提示文案

## 3. 测试、知识文档与整体验证

- [x] 3.1 新增 `services/buildr-harness-web/test/ui/focus-settings-layout.test.mjs` 单元测试，覆盖全屏两级布局规则、去掉右箭头、标题收口、隐藏列表与导轨语义，验证测试通过
- [x] 3.2 同步更新 `standalone.test.ts`、`harness-frame.ts` 与 `buildr-web` 浏览器设置测试断言并覆盖全屏设置、左导轨返回、额度直达及 `Esc` 退出路径
- [x] 3.3 更新 `knowledge/docs/architecture/agent-integration.md` 中的设置入口名称与全屏两级布局说明
- [x] 3.4 运行静态检查（`test:static`）、单元测试（`test`）、相关浏览器端到端检查（`e2e-browser:harness-standalone`、`e2e-browser:harness-frame`、`e2e-browser:agent-conversations` setup 组）、原型发现校验及关键画面视觉截图核对
