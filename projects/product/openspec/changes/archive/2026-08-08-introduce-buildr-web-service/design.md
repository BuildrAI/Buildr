## Context

Local App 已完成同仓 React 等价迁移；产品确认后前端源码权威迁至 `projects/product/services/buildr-web/`。Vite 构建产物由 `buildr` 的 `src/interfaces/local-app/http/server.mjs` 从 `../web-dist` 同源 loopback 托管；npm package 与 launcher 打包同一套 dist。

已确认决策：

- **1A**：新建 `projects/product/services/buildr-web`，`source.type: workspace`，与 `buildr` 同仓同级，登记 `services/manifest.yml`。
- **2A**：`buildr` Local App HTTP **继续**同源 loopback 托管构建产物；`buildr-web` 拥有 React/Vite 源码与构建；构建产物由 `buildr` 在构建/打包时消费到现有 `web-dist`。

Brief / design 已确认，实现已授权；在 task worktree 落地 Service 登记、源码迁移与构建交接。

## Goals / Non-Goals

**Goals:**

- 在 Service registry 中表达真实的前端工程边界，并把 React/Vite 源码所有权迁到 `buildr-web`。
- 保持 Local App 用户可观察行为、深链、session 写保护与离线 CSP 不变。
- 保持 checkout / npm package / launcher 三入口仍只依赖 `buildr` 内可服务的静态 dist。
- 用明确的构建交接约定连接 `buildr-web` 产物与 `buildr` 托管路径。

**Non-Goals:**

- 独立 Git 仓或跨仓版本矩阵。
- 云端认证、分域 CORS、CDN、远程静态托管。
- 改变 session 安全模型或扩大 Local App 产品边界。
- 独立发布前端 npm 包，或改变 Local App 安全托管模型。

## Decisions

### 1. 同仓同级 workspace Service（1A）

新建 `buildr-web`，`source.type: workspace`，`source.path: projects/product/services/buildr-web`。类型建议为 `application`（前端应用工程），与 `buildr` 并列登记。不引入独立 remote、integration branch 或虚构 Git 状态。

备选（否决）：独立 Git 仓——过早放大版本与发布矩阵，与「本阶段不改变安全托管模型」冲突。

备选（否决）：继续把前端留在 `buildr/web`——无法在 registry 表达边界，阻碍后续云端拆分。

### 2. 托管仍在 `buildr`，产物消费式交接（2A）

`createLocalWorkspaceServer` 继续从既有 `web-dist`（或等价可证明路径）服务静态资产并注入 session。`buildr-web` 负责 `npm run build`（或等价）产出静态文件；`buildr` 的 package/launcher/开发构建步骤在打包或 `app` 前置构建时复制/同步该产物。

运行时 MUST NOT 要求 `buildr-web` 源码树或 Vite 开发服务器存在。正式 browser-smoke 继续走 `buildr app` 生产托管路径。

备选（否决）：Vite 独立端口或分域托管——会破坏同源 Origin + session 写保护。

备选（否决）：运行时直接读取 `buildr-web/dist`——使已安装 npm package / launcher 依赖第二棵源码树。

### 3. 源码迁移策略

实现阶段将 `buildr/web/` 内容迁入 `buildr-web/`（保留 Vite/React/TS 栈与路由契约），更新构建脚本与文档引用，删除 `buildr` 内前端源工程。迁移后 `local-app-web-client` 以 `buildr-web` 为唯一源码根。

短暂双源并行仅允许在迁移切片内作为机械搬迁窗口，完成后 MUST NOT 保留两套权威源。

### 4. 文档确认后进入实现

Brief / design 确认与开发授权后，在 task worktree 完成登记、迁移、构建交接与当前认知 reconcile；正式 Verification 与 Finish 仍按 Task Development 推进。

## Risks / Trade-offs

- [Risk] 构建交接路径漂移，导致 package/launcher 缺 dist。→ specs 要求可证明路径与三入口 parity；打包验证检查 dist 存在且不含前端开发 `node_modules`。
- [Risk] 开发者误用 Vite HMR 当作完成证明。→ browser-smoke 仍必须打生产托管 dist。
- [Risk] Service registry / knowledge 未同步，界面与 doctor 看不到 `buildr-web`。→ 登记与 current knowledge reconcile 列入 tasks。
- [Risk] 搬迁窗口出现双源权威。→ tasks 要求迁完后删除 `buildr/web` 并更新所有引用。
- [Trade-off] 同仓 workspace Service 暂不独立发布前端包，换取安全模型与三入口一致性。

## Migration Plan

0. 文档：OpenSpec propose + Brief；产品确认并授权开发。
1. 登记 `buildr-web`，创建 Service 骨架与 `AGENTS.md`。
2. 迁入 React/Vite 源码；配置 `buildr-web` 构建输出约定。
3. 更新 `buildr` 构建/打包消费步骤，写入既有 `web-dist`；验证 HTTP 托管与三入口。
4. 删除 `buildr/web`；更新 specs knowledge / Service 说明。
5. 受影响验证（含 browser-smoke）通过后收敛 Change 并 Finish。
6. 回滚：恢复上一提交；无需数据 migration。

## Open Questions

无。1A/2A、非目标与「先文档后实现」闸门已由产品确认。
