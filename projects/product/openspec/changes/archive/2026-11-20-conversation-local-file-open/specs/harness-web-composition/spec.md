## ADDED Requirements

### Requirement: 本机已认证对话必须支持打开本地文件与隔离预览 HTML

在通过本机同源会话认证的独立 Harness 网页及 Buildr Web 对话中，用户点击对话消息或工具成果中的本地文件引用时，系统 MUST 按调用方已核验权限允许预览可读的本机普通文件，不再将打开范围限制为 `harness-local` 目录对话或当前工作空间/已登记代码库根目录内；其中已登记代码库内文件在 Buildr Web MUST 继续优先在代码浏览器打开，含父级穿越或主目录缩写等不能唯一确认来源的相对引用（如 `../outside.md`、`~/...`）MUST 继续拒绝。

对于 `.html` 与 `.htm` 文件（上限 20 MiB），服务端的独立只读 HTML 预览端点 MUST 使用隔离沙盒策略响应（`Content-Security-Policy` 包含 `sandbox allow-scripts`、`connect-src 'none'`、`frame-ancestors 'self'` 且不包含 `allow-same-origin`），前端预览组件 MUST 支持在沙盒 `iframe` 内就地交互预览、切换查看源码、在新标签页打开及复制路径，且打开本地文件预览弹窗 MUST NOT 退出当前专注模式；未携带有效同源会话凭据或跨站请求 MUST 被拒绝。

#### Scenario: 独立 Harness 网页打开 Buildr 对话及工作空间外文件
- **WHEN** 已通过页面会话认证的本机用户在独立 Harness 网页中查看 `buildr` 工作空间或 `@default` 对话，并点击工作空间外（如 `/tmp`）的本地文件
- **THEN** 系统 MUST 允许读取并打开该文件的本地预览，不再返回「仅能读取准确目录对话的来源文件。」或目录越界 403 错误

#### Scenario: Buildr Web 区分代码库文件、外部绝对路径与模糊相对路径
- **WHEN** 用户在 Buildr Web 对话中分别点击已登记代码库内文件、工作空间外明确绝对路径（如 `/tmp/demo.md`）以及相对父路径穿越（如 `../outside.md`）
- **THEN** 已登记代码库文件 MUST 继续进入代码浏览器，工作空间外明确绝对路径 MUST 在本页弹窗预览而不退出专注模式，而 `../outside.md` MUST 继续报错拒绝

#### Scenario: HTML 交互预览、源码切换与未认证拒绝
- **WHEN** 已认证用户点击 `.html` / `.htm` 本地文件或在文件卡片选择预览，并切换源码视图或点击「新标签页打开」
- **THEN** 预览端点 MUST 以无 `allow-same-origin` 的 `sandbox allow-scripts` CSP 返回完整 HTML（最高 20 MiB），弹窗与新标签页均可正常渲染交互且不能读取宿主会话或接口；未携带有效 Cookie 或跨站请求 MUST 返回 403
