# 变更提案：改造 Buildr Development DSH 插件为 @buildr-ai/dsh-buildr-development

## 为什么做
既有 `projects/product/services/dsh-plugin`（`@buildr-ai/buildr-dsh-plugin`）仍沿用 DSH 0.2.0 早期 iframe/SDK 补丁注入形态，缺少 `buildr-harness-dsh-plugin`（`@buildr-ai/dsh-buildr-harness`）已落地的零 SDK 依赖自包含架构、真实 Electron `<webview>` 独立隔离页承载、48px macOS 顶部栏融合、DSH 右侧原生工作区（文件与代码库标签）、工作空间自适应绑定、快捷键刷新与原生图片预览联动。此外，用户明确要求以 `@buildr-ai/dsh-buildr-harness` 为参考重构 Buildr Development 插件，正式包名定为 `@buildr-ai/dsh-buildr-development`，并解决 DSH 桌面内嵌显示与真实 `Buildr Development Dev` 验收就绪问题。

## 要改什么
1. 新建独立零依赖插件服务 `projects/product/services/buildr-development-dsh-plugin`：
   - 正式包输出 `@buildr-ai/dsh-buildr-development`，本地开发版输出 `@buildr-ai/buildr-development-dsh-plugin-dev`；
   - 客户端在 DSH 左侧栏注册第 11 号槽位 Buildr Development 专属 D 形彩色图标，采用真实 `<webview partition="persist:..." />` 承载 `buildr-web`，实现 macOS 48px 可拖动标题栏与 `Dev` 徽章、工作空间自动连接/切换/错配恢复（`--replace-mismatched-development`）、原生右侧工具栏（`文件` / `代码库`）、快捷键刷新与附件大图原生预览；
   - 启动发现支持正式版 `@buildr-ai/buildr`（`Buildr Development.app` / `product-installations.json`）与开发版（严格绑定的 `BUILDR_DEVELOPMENT_DSH_*` 环境及 `Buildr Dev/development-source.json`），保持旧 `services/dsh-plugin` 不动以兼容既有测试；
   - 补齐自举开发收尾联动（`dsh-development-plugin.mjs` + `closeout.mjs`）与 `buildr-release` 独立目标 `dsh-buildr-development` 制包校验支持。
2. 扩展共享桌面通知桥 `projects/product/services/buildr-harness-web/src/dsh-desktop-bridge.ts`：
   - 允许在不改变 Buildr Harness 默认行为的前提下按频道前缀配置 `channel` 与启用态。
3. 为 `projects/product/services/buildr-web` 增加 DSH 桌面模式适配（`dsh-desktop.tsx`）：
   - 识别 `#dsh=development`、`#dsh=explorer&workspace=...`、`#dsh=source-control&workspace=...` 并在 SPA 路由切换后通过 `sessionStorage` 维持宿主模式；
   - 在顶部壳层提供 `返回 DSH` 与 `切换 DSH 工作区侧栏` 按钮，向宿主实时同步当前工作空间 `scope`，按实时偏好将聊天定位文件委派给 DSH 右侧原生“文件”标签，并用独立工具壳层承载原生“文件”与“代码库”页面；
   - 核对并确认 `<webview>` 下任何实际阻碍内嵌或静态/API 资产加载的响应头或会话行为，如有阻断按最小必要边界调整并回归后端 HTTP 测试。

## 影响
- 服务：`buildr-development-dsh-plugin`（新增）、`buildr-web`、`buildr-harness-web`、`buildr`（仅涉及工具列表与必要测试/自举同步兼容，核心命令行与 HTTP 接口兼容不变）。
- 工作流与技能：`buildr-release` 增加 `dsh-buildr-development` 独立发布目标（因 npm 包尚待首次创建与 OIDC 绑定，发包阶段暂停待人工操作）；`buildr-self-bootstrap-sync` 同步管理 Buildr Development Dev 插件装入本机桌面。
