## Why

对话正文里的图片以 Markdown 内联图片显示，宽度受对话面板限制。图片本身可以是高分辨率截图，但界面没有放大入口：用户只能看缩小后的画面，无法看清截图中的小字，也不能按原始像素核对。引用图片文件的链接已经有“图片预览”模态框，内联图片却没有同样的能力。

## What Changes

- 对话正文中的内联图片可点击（鼠标与键盘）打开预览；预览使用与内联显示相同的认证图片地址，不新增读取路径。
- 预览以接近视口的尺寸显示，并提供“实际大小/适应窗口”切换与“新窗口打开”，便于按原始像素查看截图。
- 预览绑定当前对话选择：切换对话、关闭或按 Esc 时关闭；不改变对话内容、草稿或执行事实。
- 图片不可读取、超限或来源不被允许时保持既有失败说明，不伪造成功。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 对话内联图片增加放大预览交互，沿用既有图片认证、来源边界与对话归属。

## Impact

- `services/buildr-web/src/components/MarkdownHost.tsx`：为已解析图片附加可操作语义与触发。
- `services/buildr-web/src/markdown.ts`：保留图片原始引用，供预览显示来源。
- `services/buildr-web/src/features/agent-conversations/ConversationPanel.tsx`、`ConversationImagePreview.tsx` 与样式：复用现有预览并扩展尺寸与实际像素切换。
- 测试：前端逻辑测试与 `agent-conversations` 浏览器旅程。
- 不涉及后端接口、图片读取授权、存储或数据结构。
