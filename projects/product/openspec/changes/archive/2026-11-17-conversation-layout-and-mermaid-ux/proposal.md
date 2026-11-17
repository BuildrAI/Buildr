## Why

用户在使用 Buildr Web 对话界面与信息流流程图时存在三项直接影响连续阅读与操作效率的问题：

1. 在专注模式下打开对话列表后刷新页面，外层与内层状态未持久化专注模式及列表展开状态，导致页面重新退回分屏模式。
2. 在打开对话列表、准备新建对话并切换所属工作空间时，未保留当前对话列表分屏状态，切换空间会连带把对话列表关闭；同时内嵌导轨切回对话视图和任务关联底栏展示也存在多余关联。
3. 信息流及共享正文阅读器中的 Mermaid 流程图只支持局部小窗滚动查看，缺少点击放大全屏矢量预览及导出图片能力，且图表纵向滚到顶/底或无溢出时因 `overscroll-behavior: contain` 阻断滚轮继续带动外层信息流滚动。

不包含破坏性变更（无对外 API 或持久化协议破坏性修改）。

## What Changes

- **专注模式与对话列表状态持久化**：Development 外层 `harness-ui` 与 Harness 网页持久化对话面板的专注/分屏模式及专注模式下对话列表的展开状态，刷新页面后恢复一致呈现；显式收起面板、退出专注模式或普通分屏模式下刷新仍回到对应安全默认视图。
- **消除切换工作空间与导轨交互的多余 UI 耦合**：在专注分屏打开对话列表时，新建对话切换工作空间、首条发送创建对话、分叉跳转或切换对话默认保留左侧对话列表展开；点击内嵌导轨当前对话按钮在列表可见时只切回对话视图而不直接收起面板；专注分屏右栏保留任务关联底栏并跟随左栏宽度变化对齐。
- **共享 Mermaid 流程图放大预览与边界滚轮衔接**：共享正文阅读器（`buildr-harness-web` 与 `buildr-web`）为已渲染 Mermaid 流程图增加放大预览入口（右上角放大按钮、点击图示与键盘触发），提供全屏矢量预览弹层（自适应窗口、鼠标锚点缩放、拖拽平移、1:1 切换、导出 PNG 图片、复制源码）；内嵌 iframe 场景将预览代理到 Development 顶层页面全屏展示；同时放开图表容器纵向滚动链并将到达顶部/底部或无纵向溢出时的纵向滚轮平滑传递至外层可滚动容器。

## Capabilities

### New Capabilities

### Modified Capabilities

- `harness-web-composition`: 扩展对话模块偏好的持久化范围，涵盖专注/分屏模式及专注模式下的对话列表展开状态。
- `buildr-web-client`: 补充专注分屏中新建对话切换工作空间及创建对话保持列表展开、导轨与底栏解耦的行为要求。
- `project-knowledge-browsing`: 补充共享正文阅读器已渲染 Mermaid 图示的放大矢量预览、导出图片及纵向滚轮衔接外层容器的行为要求。

## Impact

- **受影响服务**：`product/buildr-web`、`product/buildr-harness-web`（及 `buildr` 端到端验收测试 `test/e2e/harness-frame.ts`）。
- **主要源码文件**：
  - `services/buildr-web/src/features/harness-ui/AgentConversationsContext.tsx`、`ConversationWorkspace.tsx`
  - `services/buildr-harness-web/src/HarnessApp.tsx`、`features/agent-conversations/{AgentConversationsContext.tsx,ConversationPanel.tsx,ConversationDock.tsx,conversation-state.ts}`
  - 共享 Markdown 与 Mermaid 组件（双端对齐）：`src/markdown.ts`、`src/shared.css`、`src/components/{MarkdownHost.tsx,MarkdownDiagramPreview.tsx}`、`src/lib/{markdownDiagrams.ts,markdownDiagramSvg.ts,markdownDiagramPreviews.ts}`
- **安全与兼容性**：保持 Mermaid 独立沙箱 iframe 与 DOMPurify 严格过滤策略；增量持久化键兼容旧版浏览器存储与不可用存储环境。
