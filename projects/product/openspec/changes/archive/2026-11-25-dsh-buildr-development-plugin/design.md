# 技术设计：@buildr-ai/dsh-buildr-development

## 架构对照（与 @buildr-ai/dsh-buildr-harness 对齐）

1. **零 DSH SDK 与独立服务结构**：
   - `projects/product/services/buildr-development-dsh-plugin` 不声明第三方运行时 `dependencies`，也不携带任何 `sdk-patches/`。
   - `src/index.ts` 通过 `ctx.webServer.register(OPEN_PATH, ...)` 注册受桌面请求头（`x-buildr-development-desktop` + loopback + 已认证 `browserPeer` + 无 body）保护的 `POST` 入口，执行本机 Buildr Development 启动与会话句柄核对，并通过 `recordDesktopActivation` 写入私人受限（`0o600`）开发加载回执 `dsh-development-web-desktop.json`（避免与 Harness 的 `dsh-development-desktop.json` 冲突）。
   - 同时保留 `projects/product/services/dsh-plugin`（`@buildr-ai/buildr-dsh-plugin`）在仓库中的既有形态，以确保现有 50+ 静态与发布契约测试零破坏。

2. **与 Harness 并存隔离标识**：
   - 两个插件将长期并存安装在 `/Users/chenjun/.dsh/profiles/desktop`：
     - `panelId`: `dsh-buildr-development`（正式）/ `buildr-development-dev`（开发），侧栏槽位 `order: 11`（紧随 Harness 的 `10`）。
     - `ANCHOR`: `'--buildr-development-dsh'`；Carrier Key: `buildr.development-dsh.released.carriers.v1` / `buildr.development-dsh.carriers.v1`。
     - `OPEN_PATH`: `'/dsh-buildr-development/open'` / `'/buildr-development-desktop/open'`；`DESKTOP_HEADER`: `'x-buildr-development-desktop'`。
     - `CHANNEL`: `'buildr-development-desktop/v1:'`；工具前缀 `buildr-development-`。
     - 环境变量：`BUILDR_DEVELOPMENT_DSH_NODE`、`BUILDR_DEVELOPMENT_DSH_PACKAGE_ROOT`、`BUILDR_DEVELOPMENT_DSH_DATA_ROOT`、`BUILDR_DEVELOPMENT_DSH_PORT`、`BUILDR_DEVELOPMENT_DSH_LAUNCH_NONCE`。

3. **Development Web（SPA 路由）与无票据登录差异处理**：
   - **入口鉴权**：`buildr-web` 的 `GET /` 与 `GET /workspaces/*` 直接注入 `__BUILDR_SESSION_TOKEN__` 并签发本地会话 Cookie，不使用 `#ticket=` 兑换机制；`handoff.ts` 仅校验严格 loopback `http://127.0.0.1:<port>` 与无凭据、无路径越界的合法入口 URL。
   - **Launcher 启动与复用**：通过 `projects/product/services/buildr/bin/buildr.mjs web status/open` 发现、拉起并核对对应开发域（端口 `4458`）或正式发布域（端口 `4456` 或 `launcher-binding` 配置）实例，确认健康地址与目标安装完全一致后返回 `{ origin, url }`。
   - **SPA 信任边界（`guest.ts`）**：`buildr-web` 使用 `createBrowserRouter` 切换真实路径（如 `/`、`/workspaces/:id/overview`），因此中心 `<webview>` 的 `isTrusted()` 检查需校验严格同源同端口且排除 `/api/` 路径；资源脚本与 Vite 热更新探测分别校验 `/assets/` 与 `/src/`，并在首次以 `#dsh=development` 打开后通过 `sessionStorage` 在整次页签会话内持久保持桌面模式与 `buildr-development-desktop/v1:` 桥接。
   - **内嵌兼容**：Electron `<webview>` 作为顶层 Guest WebContents，不因页面级 `X-Frame-Options: DENY` / `CSP frame-ancestors 'none'` 被拦截；本设计默认保留 Buildr HTTP 安全响应头，仅在真实桌面 DSH `0.2.2-rc.5` 实测观察到拦截时再按最小必要范围放开。

4. **Buildr Web DSH 模式与原生右侧工具栏**：
   - `buildr-web/src/app/dsh-desktop.tsx` 提供工具路由识别（`explorer`、`source-control`）以及独立的 `<MemoryRouter>` + `WorkspaceReadCacheProvider` + `WorkbenchPreferencesProvider` + `WorkspaceSourceControlProvider` + `WorkspaceFileEditingProvider` + `AppShellContext` 工具容器，复用既有 `<CodeExplorerPage />` 与 `<CodeSourceControlPage />`。
   - 宿主通知选中的文件（`reveal`）或切换工作空间时，通过 `window.dispatchEvent(new CustomEvent('buildr-dsh-host', ...))` 与工具页双向同步；工具页准备就绪后发 `tool-ready` 以确保首跳定位不丢失。
