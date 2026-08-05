## Context

项目已经维护 `projects/product/docs/publications/` 作为对外文章源，文章元数据记录多个发布目标。当前 Local App 的导航和 HTTP API 只覆盖工作空间、项目、服务、任务和变更，没有文章读模型；当前 Markdown 渲染器也不支持图片。

这次需要把文章作为本机应用中的只读资源投影，同时保留项目文件作为唯一内容源。Local App 只能从已登记 Workspace 解析 Product Project 的固定 `docs/publications/` 目录，不接受页面传入的任意 root/path。

## Goals / Non-Goals

**Goals:**

- 在 `docs/publications/` 中保存两篇文章的本地配图，并让 Markdown 使用稳定的相对资源路径。
- 为 Local App 增加独立“文章”导航入口、文章列表页和文章详情页。
- 通过只读 Application/API 读取文章元数据、正文和受控图片资源。
- 复用现有 Markdown 渲染器，并支持文章中的本地图片。
- 为空目录、缺失目录、无效文章元数据和越界资源提供稳定诊断或空状态。

**Non-Goals:**

- 不在 Local App 编辑文章、修改发布状态或执行外部平台发布。
- 不建立文章数据库、第二份正文、平台 adapter 或定时同步器。
- 不将现有产品说明、OpenSpec knowledge、Task/Change 页面迁移到 publications。
- 不把 Local App 暴露为公网文档站；它仍是本机 Web 应用。

## Decisions

### 1. 使用独立 Publication Application

新增窄的 Publication Application，负责读取 Product Project 的 `docs/publications/`，而不是让 HTTP server 直接扫描文件。这样保持 Local App interface 只调用 read model，同时不把文章内容塞入 Project registry、Task Record 或数据库。

备选方案是把读取逻辑直接加入 Project Application；这会把产品项目登记和公开文章内容混成一个职责，后续难以扩展文章列表与资源安全边界，因此不采用。

### 2. 只允许固定的 Product Project publication root

Application 通过现有 Project registry 解析 `product` 的 Workspace 相对 source path，并只读取其下的 `docs/publications/`。文章 ID 必须来自 Markdown front matter，详情和资源请求只接受已列出的 ID/文件名；真实路径必须保持在该固定目录内，并拒绝符号链接或路径穿越。

备选方案是接受 `root`、`path` 或任意项目路径查询；这会破坏 Local App 已有的 registered Workspace 安全边界，因此不采用。

### 3. 文章正文保持 Markdown 源，图片走项目相对路径

文章源文件使用 `assets/<filename>` 的相对图片路径。API 返回正文时保留源 Markdown，文章页面只在渲染前将受控相对图片解析为当前 Workspace 的资源 API URL；平台发布仍可直接使用项目 Markdown，再由发布适配流程处理图片。

备选方案是把图片转成 Base64 嵌入 Markdown；这会放大正文、降低跨平台可读性，也不利于后续替换图片，因此不采用。

### 4. Local App 只提供独立只读文章入口

导航新增“文章”，路由使用 Workspace-scoped `/articles` 和 `/articles/:publicationId`；列表展示标题、类型、状态和发布目标，详情展示渲染正文并保留原文视图。文章不存在或目录未提供时显示可解释的空状态，不影响其他资源页面。

## Risks / Trade-offs

- **[文章元数据格式过于宽松]** → 只接受带 `id`、`title` 的 Markdown 文章，并对列表/详情返回稳定诊断；不把任意 Markdown 文件自动暴露为文章。
- **[图片路径被利用读取任意文件]** → ID、文件名、真实路径 containment、regular-file 和 symlink 检查全部在 Application 层执行；HTTP 不接收任意文件系统路径。
- **[Local App 文章内容与源文件漂移]** → 详情每次从当前 canonical Workspace 读取，不写入 SQLite 或缓存正文；响应使用 no-store。
- **[现有 Markdown 渲染行为回归]** → 图片语法只新增受控分支，保留现有标题、列表、表格、链接和原文视图，并补充单元/浏览器验证。

## Migration Plan

1. 在 `docs/publications/` 保存两篇文章配图，并更新相对 Markdown 引用。
2. 发布窄 OpenSpec Change，按现有 Local App Application、HTTP、Web 和 Browser Smoke 边界实现。
3. 验证文章列表、详情、图片、空目录和路径拒绝行为。
4. 不需要数据库迁移；回滚时移除文章入口/API和新增资源即可，既有文章源文件可以保留。

## Open Questions

无。微信公众号等平台仍只记录为文章发布目标，Local App 作为本机只读展示面实现。
