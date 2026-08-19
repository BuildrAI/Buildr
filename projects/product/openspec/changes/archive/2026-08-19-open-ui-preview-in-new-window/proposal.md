## Why

Task 预演舞台用静态「隔离预览」文案标注沙箱状态，但不能把当前页面放到独立窗口里对照。隔离策略已经允许直接打开内容响应并保持 opaque origin，现在需要把该能力做成明确控件。

## What Changes

- 预演舞台把「隔离预览」替换为「新窗口打开」按钮。
- 点击后用新窗口打开当前选中页面的同一 Task-scoped 内容 URL。
- iframe sandbox、CSP 与 opaque origin 保持不变；不把预演 HTML 注入父页面 DOM。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `local-app-web-client`: 预演视图 MUST 提供「新窗口打开」；新窗口 MUST 打开当前页面同一内容 URL，且继续处于 opaque origin。

## Impact

- `projects/product/services/buildr-web`：`PreviewTab` 舞台标题区。
- `projects/product/services/buildr`：browser smoke 断言按钮与同源内容 URL；`web-dist` 随前端构建更新。
- 当前认知：`knowledge/services/buildr-web.md` 预演 Tab 描述。
- HTTP 内容响应、session 与 CSP 契约不变。
