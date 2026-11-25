# DSH Buildr Development (`@buildr-ai/dsh-buildr-development`)

独立集成 DeepSeek Harness Desktop (`0.2.x`) 与本机 Buildr Development Web，采用零 DSH SDK 运行时依赖的自包含插件结构。

## 兼容范围

- DSH Desktop: `>=0.2.0-0 <0.3.0-0`（当前 macOS 桌面验收基线 `0.2.2-rc.5`）
- 正式通道关联产品: `@buildr-ai/buildr` `>=0.1.0-rc.65 <0.2.0-0`
- 开发通道（`@buildr-ai/dsh-buildr-development-dev`）: 通过本机受信任 `BUILDR_DEVELOPMENT_DSH_*` 环境变量与默认 `http://127.0.0.1:4458` 连接仓库开发版 Buildr，与 `@buildr-ai/dsh-buildr-harness` / `@buildr-ai/dsh-buildr-harness-dev` 通道、对话槽位优先级与标识完全隔离，可并存安装并任意顺序互切。

## 主要能力

- DSH 左侧导航入口使用 Buildr Development 专属彩色 D 标，中心以 `<webview>` 完整承载 Buildr Development 工作台与工作空间管理页；
- macOS 48px 可拖动顶部栏与当前工作空间名称联动，支持 `返回 DSH`、切换 DSH 原生右侧栏（“文件”与“代码库”）、工作空间目录自动对齐、快捷键刷新（`Cmd+R` / `Ctrl+R`）与聊天代码定位直达原生“文件”标签。
