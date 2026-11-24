## 1. 共享本地文件与 HTML 隔离预览（buildr-harness）

- [x] 1.1 新增 `local-file-preview.ts` 并从主入口导出本地文件预览与隔离 HTML 响应能力（文本 1 MiB / 图片 8 MiB / HTML 20 MiB）。
- [x] 1.2 放开 `server.ts` `/directories` `preview` 对所有调用方有权读取对话的支持，并在 `web-endpoint.ts` 暴露 `GET /api/v1/harness/files/html` 沙盒端点。

## 2. Buildr Web 本地文件端点与回退（buildr / buildr-web）

- [x] 2.1 在 `session.ts` 与 `router.ts` 增加 `POST /api/v1/conversation-file`、`GET /api/v1/conversation-file/html` 及 `buildr-file` 会话 Cookie，并在 `buildr-web` API 客户端保留顶层直连路由。
- [x] 2.2 在 `buildr-web` `ConversationWorkspace.tsx` 保留代码库优先与模糊相对穿越拒绝行为，对其余明确路径回退本地弹窗预览且不退出专注模式。

## 3. 前端弹窗组件与全面验证（buildr-harness-web / 跨服务）

- [x] 3.1 新增 `LocalFilePreviewModal`（页面预览 / 查看源码 / 新标签页打开 / 复制路径），并接入 `HarnessApp.tsx`、`ConversationPresentedFiles.tsx` 与 `ConversationPanel.tsx`。
- [x] 3.2 补全单元测试、集成测试、Playwright Chromium 真实原型验证及四服务全量检查。
