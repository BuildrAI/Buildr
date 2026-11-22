## Why

对话里的 HTML 章节链接被当成完整文件路径，真实报告存在也无法打开。

## What Changes

- 本机 HTML 章节链接通过隔离预览打开并定位；缺少章节时仍可阅读报告。
- 不改变一般文件打开、代码行号、原样文件名或访问权限。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `harness-web-composition`：约定本机 HTML 章节链接的打开行为。

## Impact

Buildr Web 和独立 Harness 对话共享的预览处理与测试；无后端接口或依赖变化。见[任务说明](@task/html-preview-anchor)。
