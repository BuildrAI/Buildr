## Why

用户在已认证的本机对话界面点击文件链接（尤其是 `/tmp/...` 下的交互原型或 Buildr 工作空间对话中的本地文件）时会被拦截：

1. 独立 Harness 网页调用 `POST /api/v1/harness/files` 时，后台只允许 `harness-local` 目录对话且限定在工作空间根目录内，Buildr 工作空间对话直接报 `403 agent_directory_file_forbidden`（“仅能读取准确目录对话的来源文件。”），工作空间外文件（如 `/tmp/...`）同样被拒。
2. Buildr Web 中 `ConversationWorkspace.tsx` 对无法映射到已登记代码库工作树的文件统一报错（“不能确认文件的准确工程来源。”），导致 `/tmp` 等明确绝对路径无法在对话中打开。
3. `.html` / `.htm` 在独立 Harness 网页中仅按 1 MiB 文本截取并用 `<pre>` 展示源码，无法就地交互预览。

## What Changes

- **放开本机第一方已认证对话的本地文件打开范围**：
  - 独立 Harness 网页允许读取调用方有权查看的任意对话（`harness-local`、`buildr`、`@default`）下的本机可读普通文件，包括工作空间外部的绝对路径及相对对话 `cwd` 解析的文件。
  - Buildr Web 保留已登记代码库文件优先进入代码浏览器、模糊相对穿越（如 `../outside.md`、`~/...`）继续拒绝的语义；对其余明确绝对路径（如 `/tmp/...`），回退到本机文件预览弹窗就地打开，不退出专注模式。
- **支持 HTML 沙盒交互预览**：
  - 抽取共享本地文件预览能力（`buildr-harness`），普通文本与 Markdown 上限保持 1 MiB、图片 8 MiB、HTML 放宽至 20 MiB。
  - 独立 Harness 网页与 Buildr Web 分别提供同源会话鉴权的隔离 HTML 响应端点，使用严格沙盒 CSP（`sandbox allow-scripts`、不含 `allow-same-origin`、`connect-src 'none'`、`frame-ancestors 'self'`）。
  - 在 `buildr-harness-web` 提供共享弹窗预览组件与 `ConversationPresentedFiles` 集成，支持页面交互预览、查看源码切换、新标签页打开及复制路径。

## Capabilities

### Modified Capabilities

- `harness-web-composition`：支持本机第一方已认证对话打开工作空间内外本地文件与隔离交互预览 HTML。

## Impact

涉及 `buildr-harness`、`buildr-harness-web`、`buildr-web`、`buildr` 四个服务及产品规范 `harness-web-composition`，不修改 `ui-prototype` 技能或外部程序凭据权限。任务见[任务](@task/conversation-local-file-open)。
