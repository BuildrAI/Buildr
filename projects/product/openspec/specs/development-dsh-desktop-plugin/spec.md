# Development DSH 桌面插件规范

## ADDED Requirements

### Requirement: 独立零 SDK 依赖插件包与渠道隔离
系统 MUST 提供独立服务目录 `projects/product/services/buildr-development-dsh-plugin` 与 `@buildr-ai/dsh-buildr-harness` 采用相同自包含插件架构，零第三方运行时依赖且不修补 DSH SDK：
- 正式发布包名 MUST 为 `@buildr-ai/dsh-buildr-development`，仅连接本机已核验的正式 Buildr Development 安装（`@buildr-ai/buildr` `>= 0.1.0-rc.65`）及对应正式数据域；
- 本机开发包名 MUST 为 `@buildr-ai/buildr-development-dsh-plugin-dev`，仅接受由环境变量 `BUILDR_DEVELOPMENT_DSH_*` 或受信任的本地 `Buildr Dev/development-source.json` 明确绑定的开发实例，并在激活时向受限数据目录写入私有回执 `dsh-development-web-desktop.json`；
- 与 `@buildr-ai/dsh-buildr-harness` 及其 Dev 变体在同一 DSH 配置目录并存时，插件标识、侧栏顺序（`11`）、桌面通信通道（`buildr-development-desktop/v1:`）、服务端触发路径（`POST /dsh-buildr-development/open` / `POST /buildr-development-desktop/open`）、请求头（`x-buildr-development-desktop`）和会话存储键 MUST 完全隔离，互不干扰。

#### Scenario: 双 Dev 插件在桌面 DSH 并存安装与激活
- **WHEN** 本机同时在 DSH `desktop` 配置安装 `@buildr-ai/buildr-harness-dsh-plugin-dev` 与 `@buildr-ai/buildr-development-dsh-plugin-dev`
- **THEN** 左侧导航栏同时呈现 Harness 与 Buildr Development 两个独立入口及对应品牌矢量图标，互不覆盖配置、端点与工作区状态。

### Requirement: DSH 桌面内嵌显示与原生协作体验
插件 MUST 在 DSH 中心面板使用真实 Electron `<webview>` 加载 Buildr Development Web，并提供以下桌面融合行为：
- 启动握手端点仅接受带有精确桌面请求头、无请求体且通过本机 `browserPeer` 认证的本地 `POST` 请求；返回严格的 loopback 同源入口地址，允许 SPA 在同源非 `/api/` 路径内正常跳转，通过 `sessionStorage` 保持整次会话的 DSH 宿主模式；
- 中心顶部呈现 macOS 48px 可拖动标题栏（开发版带 `Dev` 徽章）与当前工作空间名称；提供 `返回 DSH`、切换 DSH 原生右侧栏按钮与工作空间目录自动对齐/显式换绑恢复（`--replace-mismatched-development`）；
- DSH 原生右侧工作区提供无产品前缀的“文件”与“代码库”工具标签，并在聊天点击定位代码文件时按实时偏好委派到原生“文件”标签，支持主工作区面板快捷键刷新与附件大图预览桥接。

#### Scenario: 在 DSH 桌面进入 Buildr Development 并切换工作空间与文件工具
- **WHEN** 用户在 DSH 左侧栏点击 Buildr Development 入口进入中心面板，并在页面中选择或切换工作空间与定位代码文件
- **THEN** 中心 `<webview>` 正常显示 Buildr Development 完整工作台（无被禁止嵌入报错），顶部标题栏同步展示工作空间名称，且可顺畅打开/切换 DSH 右侧原生“文件”和“代码库”标签并定位到对应文件与行号。
