## Context

Local App 今日形态是 `src/interfaces/local-app/http/server.mjs` 同源 loopback HTTP + `web/` 下无构建 vanilla ESM SPA。服务端用 `STATIC_ASSETS` 白名单读源文件，并向 `index.html` 注入 `__BUILDR_SESSION_TOKEN__` / preview meta。写 API 校验 Origin、session 与 JSON body。npm package 的 `files` 包含整棵 `src/`，launcher 复制 `src/`，因此 vanilla 源即生产资产。

产品决定：先在同一 `product/buildr` Service 内用 React 等价迁移（1A），并为日后云端 Web / `buildr-web` 分仓预留契约边界（2B），本 Change 不实现云端或独立前端仓。

并行 Local App Changes 的依赖与顺序约束见同目录 [dependency-notes.md](dependency-notes.md)。功能等价验收项见 [parity-checklist.md](parity-checklist.md)。产品已确认 Brief；在明确授权开发前只维护文档，不跑基线、不写实现。

## Goals / Non-Goals

**Goals:**

- 用 React 19 + Vite + TypeScript 重建全部已挂载 Local App 路由与交互，用户可观察行为与现网一致。
- HTTP server 托管构建产物；session 注入、SPA 深链、preview 身份条与写保护不变。
- checkout CLI、`npm` 安装包与 `Buildr Dev` launcher 启动同一套 dist。
- `product.browser-smoke`（及 shell/project/service/task/articles selector）在生产托管路径上证明功能完整。
- 客户端区分「公共 API client」与「本机 session adapter」，便于未来云端 adapter 与 `buildr-web` 搬迁。

**Non-Goals:**

- 不新建 `projects/product/services/buildr-web`，不独立 Git 仓。
- 不实现云端登录、CORS 分域写 API、远程 CDN 或托管部署。
- 不扩大 Local App 产品边界（不 create Task、不在页内执行专业任务、不直连 SQLite/manifest）。
- 不借迁移做视觉大改版或新页面功能。

## Decisions

### 1. 同仓 `web/` 源 → `web-dist/` 产物，由现有 server 同源托管

前端源码置于 `projects/product/services/buildr/web/`。Vite 构建输出到 `src/interfaces/local-app/web-dist/`（或 package 可证明的等价路径）。`createLocalWorkspaceServer` 的 `STATIC_ROOT` 指向 dist；未匹配 API 的 Workspace 深链返回注入 session 的 dist `index.html`。

选择同进程同源托管而非 Vite 独立端口，是为了继续满足 Origin + session 写保护与离线 CSP，避免迁移阶段引入 CORS。Vite dev server 仅允许本地 HMR；正式验证与 browser-smoke MUST 走 `buildr app` 托管 dist。

备选（否决）：立即拆 `buildr-web` 仓——在功能等价与三入口 parity 证明前会放大版本矩阵与安全模型风险。

### 2. 技术栈固定为 React 19 + Vite + TypeScript + React Router

路由 path 对齐现有 `routeDefinitions`（`/`、`/workspaces/:id/...`）。样式先移植现有 `styles.css`，降低视觉漂移掩盖行为回归的风险。不引入远程字体/脚本；构建产物全部 self-hosted。

备选（否决）：继续扩展 vanilla 或引入需 CDN 的组件库——与离线 MUST 冲突，也不利于后续页面扩展。

### 3. 按路由切片迁移，单一生产入口，禁止长期双栈

迁移顺序：基础设施 → Workspaces/Overview/Settings → Projects → Services → Articles → Tasks 列表 → Task 详情五页签 → Task-scoped Change → Agent Actions。每一片切换后跑对应 browser selector；全部切片绿且 `test:browser:smoke` 通过后删除 vanilla `web/` 与源文件白名单模式。

生产只服务一份 dist，不在 server 上按路由混用 vanilla/React，避免半套页面。回滚依赖 git 历史恢复上一绿 dist 或上一提交。

### 4. 客户端分层：API client + LocalSessionAdapter

- `api`：纯 fetch、Workspace 路径改写、错误类型；不读取 DOM meta。
- `LocalSessionAdapter`：从 `<meta name="buildr-session">` 提供写请求头；未来 CloudAuthAdapter 仅作为接口扩展点写入本 design，本 Change 不实现。
- Task 等复杂页用 hooks/view-model 收拢 Application 依赖，降低日后搬仓成本。

### 5. 打包与验证门禁

`package.json` `files`、launcher `build.mjs` 与 package inventory 必须包含 web dist，并排除仅用于开发的 `web/node_modules` 等。Candidate / delivery-required 路径继续要求 `product.browser-smoke`；切片开发用 `test:browser:<selector>`。实现阶段需增加或调整构建步骤，使 task environment / CI 在跑 browser 前产出 dist。

### 6. 与并行 Local App Changes 的依赖

`local-app-direct-tab-reads` 在文档完善时已 Complete；Task 详情 MUST 按各专业 Application 直读，不得恢复完整 terminal 聚合依赖。`local-app-read-store-boundary` 若仍未 Finish，Task 详情切片前须按 [dependency-notes.md](dependency-notes.md) 核对 Application 契约或等待其交付。本 Change 的 OpenSpec artifacts 不修改那些 Change 的 delta。

### 7. 文档闸门先于实现

用户确认 Brief 后，允许继续完善本 Change 文档（清单、依赖说明、specs/tasks 修订）。基线测试、React 工程与任何产品源码改动 MUST 等待明确的开发授权；授权前 Agent MUST NOT 以「推进计划」为由开始实现。

## Risks / Trade-offs

- [Risk] React 迁移期间功能回归，尤其 Task 详情五页签与 terminal delivery 文案。→ 切片迁移 + 每片 browser selector；Task 详情单独里程碑；最终 `test:browser:smoke` 门禁。
- [Risk] dist 未进 package/launcher，导致安装用户缺页面。→ npm-cli-package 与 launcher parity 场景；`npm pack` / launcher build 验证。
- [Risk] 开发者误用 Vite HMR 当作完成证明。→ specs 要求 browser-smoke 走生产托管路径。
- [Risk] 构建步骤增加 Candidate 耗时与环境依赖。→ 构建只产出静态资产；browser 仍用本机 Chrome；不在 browser 测试中下载工具链。
- [Risk] 并行 Local App Changes 冲突。→ [dependency-notes.md](dependency-notes.md)；Task 详情切片前再核对。
- [Trade-off] 同仓 React 暂时不独立前端发布节奏，换取安全模型与功能完整性优先。

## Migration Plan

0. 文档：Brief 确认；补齐等价清单与依赖说明（当前阶段）。
1. 获得开发授权后，冻结迁移前 browser-smoke / local-app 相关测试基线。
2. 引入 `web/` 工程与 dist 托管空壳，使 shell smoke 在 `buildr app` 下通过。
3. 按 [parity-checklist.md](parity-checklist.md) 切片等价迁移并逐片验证；全部完成后删除 vanilla `web/`。
4. 抽出 API client / session adapter 与必要契约测试。
5. 正式 Verification（含 `product.browser-smoke` 与受影响 integration/system）通过后 Finish。
6. 回滚：恢复上一提交或上一绿 dist；无需数据 migration。
7. 稳定后另开 `introduce-buildr-web-service` Change（本 Change 之外）。

## Open Questions

无。仓库拆分时机、托管形态与「先文档后开发」闸门已由产品确认。
