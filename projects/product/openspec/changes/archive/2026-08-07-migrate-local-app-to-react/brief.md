# Local App 迁移到 React（已确认）

## 一句话摘要

先在 `product/buildr` 同仓用 Vite + React 等价迁移 Local App，构建产物由本机应用同源托管；功能与安全模型保持完整后再考虑拆 `buildr-web` 与云端 Web。

## 文档状态

| 项 | 状态 |
|----|------|
| 产品决策（1A + 2B） | **已确认**（2026-08-06） |
| OpenSpec propose | 已完成且 `--strict` 通过 |
| 本 Brief | 已按确认更新 |
| 功能等价清单 | 见 [parity-checklist.md](parity-checklist.md) |
| 并行 Change 依赖说明 | 见 [dependency-notes.md](dependency-notes.md) |
| 仅文档交付（OpenSpec Change 进 retained） | **已完成**（2026-08-07 Formal Finish；不 converge/archive、不写 React） |
| 开发授权 / 基线 / React 实现 | **已授权；基线已记录；实现已完成**（worktree `implement-local-app-react`；全路由 React + browser smoke 已绿；vanilla 已退役，仅 `web-dist` 托管；**待正式 Verification / Finish**） |

**当前闸门：** React 实现与文档核对（tasks 5.1/5.2/5.4）已完成；**尚未**做正式 Task Verification、Completion Review 与 Finish（tasks **5.3**）。基线见 [baseline-browser-smoke-2026-08-07.txt](baseline-browser-smoke-2026-08-07.txt)。空壳、`web-dist` 托管、API client / LocalSessionAdapter、全路由迁移与 browser smoke 已通过；vanilla `src/interfaces/local-app/web/` 已删除。合入主目录靠正式 Finish；本轮**不** converge/archive，也不在本 Change 交付 `introduce-buildr-web-service`。

## 背景与问题

当前 Local App 是无构建的 vanilla JS，与 HTTP 源文件白名单强耦合。后续页面会增多并要以 React 演进；若直接分仓或改托管模型，容易破坏同源 session、离线 CSP，以及 npm / launcher / checkout 三入口一致性。

## 已确认决策

- **1A**：先同仓 React 等价迁移，完成后再拆 `buildr-web`。
- **2B**：本阶段仍是本机 Local App（`127.0.0.1` + 同源 session）；只预留云端扩展边界，不实现云端认证或分域部署。
- **推进方式**：先文档并经确认，再进入基线与实现；实现在 task worktree，合入主目录靠「收尾」。

## 目标与非目标

**目标**

- 全部已挂载路由与交互功能等价迁移到 React。
- dist 由 `buildr app` / npm package / `Buildr Dev` 同源托管。
- browser-smoke 证明生产托管路径下的功能完整。
- 公共 API client 与本机 session adapter 分层，便于日后搬仓与云端 adapter。

**非目标**

- 本 Change 不新建 `buildr-web` Service / 独立 Git 仓。
- 不实现云端登录、CORS 分域、远程 CDN。
- 不扩大 Local App 产品边界（不 create Task、不在页内执行专业任务）。
- 不借迁移做视觉大改或新功能页面。

## 分步计划

| 步骤 | 内容 | 状态 |
|------|------|------|
| 0. 文档与契约 | OpenSpec + Brief + 等价清单 + 依赖说明 | **完成** |
| 1. 基线 | 冻结 browser-smoke 等迁移前证据 | **完成**（见 baseline 文件） |
| 2. 空壳 | `web/` + dist 托管 + 三入口 + shell smoke | **完成** |
| 3. 契约分层 | API client、LocalSessionAdapter、layout/路由 | **完成** |
| 4. 切片迁移 | 见 [parity-checklist.md](parity-checklist.md) 与 [tasks.md](tasks.md) | **完成（4.1–4.9）** |
| 5. 退役与收尾 | 删除 vanilla；正式验证；Finish 合入主目录 | **5.1/5.2/5.4 完成；5.3（正式 Verification / Finish）待** |
| 后续 A | Change：`introduce-buildr-web-service` | 不在本 Change |
| 后续 B | 云端 Web | 不在本 Change |

## 硬约束（不可妥协）

- 写请求：同源 Origin + `x-buildr-session` + JSON。
- 离线：无 CDN / 远程字体脚本。
- 深链：`/workspaces/:uuid/...` 保持可用。
- 验证：browser-smoke 打生产托管 dist，不以 Vite HMR 冒充完成。
- 实现位置：`.worktrees/implement-local-app-react/`；合入靠 Task Finish「收尾」。

## 受影响范围

- Service：`projects/product/services/buildr`（新增 `web/`、改 HTTP 托管与打包）。
- 规格：新增 `local-app-web-client`；修改 `local-workspace-application`、`npm-cli-package`、`local-app-browser-verification`。
- 并行依赖：见 [dependency-notes.md](dependency-notes.md)。当前 `openspec list` 仅见本 Change 与 `persist-task-finish-state-in-sqlite`（Complete）；`local-app-read-store-boundary` 等已不在 active list。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [parity-checklist.md](parity-checklist.md)
- [dependency-notes.md](dependency-notes.md)
- [local-app-web-client](specs/local-app-web-client/spec.md)
- [local-workspace-application](specs/local-workspace-application/spec.md)
- [npm-cli-package](specs/npm-cli-package/spec.md)
- [local-app-browser-verification](specs/local-app-browser-verification/spec.md)

Worktree 路径：`.worktrees/implement-local-app-react/projects/product/openspec/changes/migrate-local-app-to-react/`
