# 引入 buildr-web Service

## 一句话摘要

在 Product 下与 `buildr` 同仓同级新建 workspace Service `buildr-web` 承接 Local App React/Vite 源码与构建；`buildr` 继续同源 loopback 托管并在构建/打包时消费产物到既有 `web-dist`。

## 文档状态

| 项 | 状态 |
|----|------|
| 产品决策（1A + 2A） | **已确认** |
| OpenSpec propose | **已完成**且 `--strict` 通过 |
| 本 Brief | 已按确认决策撰写；产品已确认 |
| 实现 / 建目录 / 搬代码 | **已授权，进行中**（闸门已放行） |
| 正式 Verification / Finish | 实现稳定后按 Task Development 推进 |

**当前闸门：** Brief / design 已确认，用户已授权「可以开发」。实现在 task worktree 进行；合入 retained 靠正式收尾。

## 背景与问题

React 等价迁移已在 `product/buildr` 同仓完成，但前端源码仍嵌在可执行 Service 内。若不拆出 `buildr-web`，Service registry 无法表达真实前端边界，后续独立演进与云端表面也会继续耦合 CLI/runtime。

## 已确认决策

- **1A**：新建 `projects/product/services/buildr-web`，`source.type: workspace`，与 `buildr` 同仓同级；登记 `services/manifest.yml`。
- **2A**：`buildr` Local App HTTP **继续**同源 loopback 托管构建产物；`buildr-web` 拥有 React/Vite 源码与构建；构建产物由 `buildr` 在构建/打包时消费（约定路径写入现有 `web-dist`）。
- **推进方式**：文档已确认；实现在 task worktree，合入主目录靠正式收尾。

## 目标与非目标

**目标**

- 登记并落地 `buildr-web` 作为前端源码与构建权威。
- 保持 Local App 行为、深链、session 写保护与离线约束不变。
- 保持 checkout / npm / launcher 三入口只依赖 `buildr` 内可服务 dist。

**非目标**

- 独立 Git 仓。
- 云端认证、分域 CORS、CDN、远程托管。
- 改变 session 安全模型。
- 扩大 Local App 产品边界（不 create Task、不在页内执行专业任务）。

## 分步计划

| 步骤 | 内容 | 状态 |
|------|------|------|
| 0. 文档与契约 | OpenSpec + Brief + knowledge impact assess | **完成** |
| 1. 文档确认 | 产品确认 Brief / design | **已确认并授权开发** |
| 2. Service 登记与骨架 | manifest + `buildr-web` 目录 | 进行中 |
| 3. 源码迁移与构建交接 | 迁 `web/`、消费到 `web-dist` | 进行中 |
| 4. 三入口与验证反馈 | 托管/打包/browser smoke | 进行中 |
| 5. 当前认知 reconcile | technical / services knowledge | 进行中 |

## 硬约束（不可妥协）

- 写请求：同源 Origin + `x-buildr-session` + JSON。
- 运行时：无 CDN；已安装环境不依赖 `buildr-web` 源码或 Vite。
- 托管：仍由 `buildr` HTTP 服务 dist，不改为独立前端端口。

## 受影响范围

- 新建：`projects/product/services/buildr-web`
- 修改：`services/manifest.yml`、`buildr` 构建/打包与 `web/` 迁出
- 规格：新增 `buildr-web-service`；修改 `local-app-web-client`、`local-workspace-application`、`npm-cli-package`、`service-asset-indexing`

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [buildr-web-service](specs/buildr-web-service/spec.md)
- [local-app-web-client](specs/local-app-web-client/spec.md)
- [local-workspace-application](specs/local-workspace-application/spec.md)
- [npm-cli-package](specs/npm-cli-package/spec.md)
- [service-asset-indexing](specs/service-asset-indexing/spec.md)

Worktree 路径：`.worktrees/introduce-buildr-web-service/projects/product/openspec/changes/introduce-buildr-web-service/`
