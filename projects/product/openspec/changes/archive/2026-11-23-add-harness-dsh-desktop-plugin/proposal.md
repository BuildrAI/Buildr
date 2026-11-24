## Why

用户需要从 DSH 桌面直接进入完整的 Buildr Harness，而不是在 DSH 的右栏预览或切到外部浏览器。已有 Development 插件不承担这一职责。先交付针对本机目标版本的独立开发插件，不改变已有入口或 DSH 会话语义。

## What Changes

- 新增独立的 Buildr Harness DSH 插件服务、开发安装包和与其相配套的本机验收入口。
- 通过 DSH 主区入口进入原样运行的 Harness Web，保留简薄返回栏，继续使用同一 Harness 后台及其账号、对话和执行。
- 绑定独立 Harness 安装与明确的数据域，仅通过 DSH 桌面授权入口引导会话；不跨域转发操作、不放宽 Harness Web 的来源或嵌入限制。
- 不改旧插件、不发布 npm、不承诺 DSH 浏览器版或其他宿主版本。无破坏性变更。

## Capabilities

### New Capabilities

- `harness-dsh-desktop-plugin`：DSH 桌面中的完整 Harness Web 入口与运行隔离。

### Modified Capabilities

无。

## Impact

新增 `buildr-harness-dsh-plugin` 服务与验证登记。复用独立 Harness 安装包的公开客户端以及 DSH Desktop 的面板和网页隔离接口；不引入第二份 Harness 前端或后台。
