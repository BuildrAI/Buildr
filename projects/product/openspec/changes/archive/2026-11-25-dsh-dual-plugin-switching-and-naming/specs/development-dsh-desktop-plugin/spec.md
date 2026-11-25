# Development DSH 桌面插件规范 Delta

## MODIFIED Requirements

### Requirement: 独立零 SDK 依赖插件包与渠道隔离
系统 MUST 提供独立服务目录 `projects/product/services/buildr-development-dsh-plugin` 与 `@buildr-ai/dsh-buildr-harness` 采用相同自包含插件架构，零第三方运行时依赖且不修补 DSH SDK：
- 正式发布包名 MUST 为 `@buildr-ai/dsh-buildr-development`，仅连接本机已核验的正式 Buildr Development 安装（`@buildr-ai/buildr` `>= 0.1.0-rc.65`）及对应正式数据域；
- 本机开发包名 MUST 为 `@buildr-ai/dsh-buildr-development-dev`，仅接受由环境变量 `BUILDR_DEVELOPMENT_DSH_*` 或受信任的本地 `Buildr Dev/development-source.json` 明确绑定的开发实例，并在激活时向受限数据目录写入私有回执 `dsh-development-web-desktop.json`；
- 与 `@buildr-ai/dsh-buildr-harness` 及其 Dev 变体在同一 DSH 配置目录并存时，插件标识、侧栏顺序（`11`）、桌面通信通道（`buildr-development-desktop/v1:`）、服务端触发路径（`POST /dsh-buildr-development/open` / `POST /buildr-development-desktop/open`）、请求头（`x-buildr-development-desktop`）、会话存储键与 `main.conversation` 槽位优先级 MUST 完全隔离，互不干扰；
- 打包产物 MUST 导出 `locale/en.json`、`locale/zh.json` 及 `icon.svg` 元数据，使 DSH 插件管理页展示可读名称、简介与官方矢量图标，并支持在 DSH 中与 Buildr Harness 按任意顺序随时切换（包括不同目录或同工作空间目录共用会话场景），不因槽位冲突或状态广播顺序导致白屏或双面板叠加。

#### Scenario: 双 Dev 插件在桌面 DSH 并存安装与激活
- **WHEN** 本机同时在 DSH `desktop` 配置安装 `@buildr-ai/dsh-buildr-harness-dev` 与 `@buildr-ai/dsh-buildr-development-dev`
- **THEN** 插件管理页分别展示 `Buildr Harness Dev` 与 `Buildr Development Dev` 及官方图标；左侧导航栏同时呈现 Harness 与 Buildr Development 两个独立入口及对应品牌矢量图标，互不覆盖配置、端点与工作区状态。

#### Scenario: 在桌面 DSH 中以任意顺序反复切换双插件
- **WHEN** 用户先打开 Buildr Development 再切换到 Buildr Harness（或反向反复切换，包括同工作空间目录共用同一 DSH 会话时）
- **THEN** 前序激活插件立即释放 `main.conversation` 单槽位、隐藏浮层并收起右栏引导项，目标插件正常注册其独立优先级槽位、完成会话对齐并完整渲染中心工作区，不出现白屏。
