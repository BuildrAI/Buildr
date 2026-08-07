## Why

Buildr Local App 当前是无构建的 vanilla ES modules SPA，与 HTTP server 源文件白名单强耦合。后续需要更多 Web 产品页面，并以 React 持续演进；若不先在同仓完成等价迁移并固化「构建产物同源托管 + UI/API 契约」，后续独立 `buildr-web` Service 与云端表面会破坏现有安全模型或造成功能回归。

## What Changes

- 在 `product/buildr` Service 内引入 Vite + React + TypeScript 前端工程，将现有 Local App 全部已挂载路由与交互做**功能等价**迁移。
- Local App HTTP interface 改为托管**构建产物（dist）**：注入 session / preview meta，深链 SPA fallback；保留 `127.0.0.1`、同源 Origin、`x-buildr-session` 写保护与离线 CSP。
- npm package、开发 checkout 与 `Buildr Dev` launcher **三入口**均可启动同一套 dist；browser-smoke 必须验证生产托管路径，不得以 Vite HMR 冒充完成。
- 抽出本机 session adapter 与公共 HTTP API client 边界，为日后云端 auth adapter / `buildr-web` 分仓预留扩展点；**本 Change 不实现**云端认证、分域部署或新建 `buildr-web` Service。
- 迁移完成且验证全绿后删除 vanilla `src/interfaces/local-app/web/` 实现。

## Capabilities

### New Capabilities

- `local-app-web-client`：Local App React 客户端源码位置、构建产物、本机 session adapter 与公共 API client 边界，以及与现网路由等价的行为完整性约束。

### Modified Capabilities

- `local-workspace-application`：允许本机应用 shell 来自 package 内构建产物；保留同源 session / loopback / 离线静态资源 MUST，并明确 SPA 深链由 dist `index.html` 提供。
- `npm-cli-package`：声明 Local App web dist 进入可发布 package 与 launcher 复制集；checkout / packaged / Dev.app 启动同一套页面。
- `local-app-browser-verification`：browser smoke 必须针对 `buildr app` 生产托管的 dist 路径；切片 selector 与功能覆盖在 React 迁移后保持可独立选择。

## Impact

- 影响 `projects/product/services/buildr`：新增 `web/` 工程、Local App HTTP 静态托管、`package.json` / launcher 打包、browser-smoke 与相关 integration/system 测试。
- 不改变 Task/Project/Service Application 写边界：页面仍只维护低风险 metadata、只生成 Agent prompt，不 create Task、不直连 SQLite。
- 并行依赖与功能等价范围见 Change 内 `dependency-notes.md`、`parity-checklist.md`；`local-app-direct-tab-reads` 已 Complete，`local-app-read-store-boundary` 若未 Finish 则约束 Task 详情切片时机。
- 独立 `buildr-web` Service 与云端 Web 另立后续 Change，不在本提案交付。
- 产品已确认 Brief，并要求先完善文档；基线与实现须另行授权。
