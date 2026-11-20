## Context

当前产品同时提供独立 Harness 网页（`buildr-harness-web` + `buildr-harness`）与嵌入式/同页装配的 Buildr Web（`buildr-web` + `buildr`）。两个入口均已基于本地回环地址、同源校验与会话 Cookie / `x-buildr-session` 认证本机第一方用户。

## Goals / Non-Goals

- 目标：让本机已认证的第一方用户点击对话里的本地文件链接或工具提供文件时，无论对话属于 `harness-local` 还是 `buildr`，也无论文件位于工作空间内外，都能直接预览；其中 `.html` / `.htm` 支持沙盒隔离交互预览与新标签页打开。
- 非目标：不放开程序凭据（Programmatic Bearer Token）或未认证请求的任意文件访问；不改变工作台（`directory-workbench`）的目录边界与保存保护；不改变 `ui-prototype` 技能存放约定；不把相对父路径穿越（`../`、`~/`）当成已确认来源。

## Decisions

1. **共享本地文件预览与隔离 HTML 响应**：在 `buildr-harness` 新增 `local-file-preview.ts` 并从主入口导出 `previewLocalFile`、`readLocalHtmlFile`、`writeIsolatedLocalHtml` 与 `LOCAL_HTML_PREVIEW_CSP`。普通文本与 Markdown 保持 1 MiB 上限，图片上限 8 MiB，HTML 预览允许 20 MiB；源码预览仅返回前 1 MiB 文本并通过 JSON IPC 传输，避免触发进程间 16 MiB 通信上限。
2. **按对话读权限校验替代 `harness-local` 硬编码**：`server.ts` `/directories` `preview` 校验对话存在及调用方对该 `workspaceId` 的读取权限，并以 `record.view.cwd || record.hostScope?.rootPath` 作为相对路径基准调用 `previewLocalFile`。独立网页新增 `GET /api/v1/harness/files/html`，先复用 `connection.directories.preview` 验证权限并解析规范路径，再直接流式输出隔离 HTML 响应。
3. **Buildr Web 保留代码浏览器优先级并增加本地回退**：`ConversationWorkspace.tsx` 继续先检查 `conversationAbsoluteFile`（拒绝 `../` / `~/` 等模糊路径）并优先匹配已登记代码库工作树进入代码浏览器；匹配不到工作树时，对明确绝对路径或可按 `cwd` 解析的本地文件回退调用 `POST /api/v1/conversation-file` 打开弹窗预览，且返回 `false` 保持专注模式不收起。Buildr Web 新增受 `buildr-file` 路径 Cookie（`Path=/api/v1/conversation-file; HttpOnly; SameSite=Strict`）保护的 `GET /api/v1/conversation-file/html` 端点。
4. **前端共享弹窗与新标签页 Cookie 兼容**：`buildr-harness-web` 提供 `LocalFilePreviewModal` 并经公开门面 `conversation.ts` 导出给 `buildr-web` 复用，使 `<iframe>` 仅存在于 `buildr-harness-web`，保持跨应用边界约定。「新标签页打开」使用 `noopener` 而非 `noreferrer`，确保同源 `SameSite=Strict` 会话 Cookie 随标签页导航发送。

## Risks / Trade-offs

- 若 HTML 原型（如带阅读器外壳的双层页面）内部使用 `<iframe srcdoc>` 嵌套渲染，隔离响应头上的 `frame-src 'none'` 可能拦截内层框架，需在真实 Playwright Chromium 下实测确认实际效果及降级表现。
- 独立网页与 Buildr Web 仅限本机第一方已认证会话；普通文本仍以 UTF-8 解码，二进制与非文本文件统一提示仅可复制路径而不执行。
