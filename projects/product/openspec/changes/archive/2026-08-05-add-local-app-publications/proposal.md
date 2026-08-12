## Why

Buildr 已经把对外文章整理到项目 `docs/publications/`，但配图仍依赖墨问页面中的临时资源，Local App 也没有统一浏览这些对外材料的入口。现在补齐本地资产和只读文章视图，可以让项目文件成为文章与配图的稳定源，并让协作者在同一个本机工作控制台中发现和阅读这些材料。

## What Changes

- 将两篇已发布墨问文章使用的配图下载为项目内稳定资源，并由文章 Markdown 引用本地文件。
- 保持 `docs/publications/` 为文章内容源，记录墨问、微信公众号和 Local App 等多个发布目标的状态与链接。
- 为 Local App 增加独立的“文章”导航入口、文章列表页和文章详情页。
- Local App 文章视图只读读取已登记 Workspace 中 Product Project 的 `docs/publications/` Markdown，不提供编辑、发布或平台同步操作。
- 增加文章列表/详情的 HTTP read API、路由、静态资源映射和隔离浏览器验证。
- 不把文章正文或发布目标关联进既有产品说明、产品当前知识、OpenSpec canonical specs 或其他内部文档；只按当前知识维护流程更新受影响的 Buildr Service 职责说明。

## Capabilities

### New Capabilities

无。文章展示属于现有 Local App 的 Project/Workspace 文档投影，不单独建立新的产品领域。

### Modified Capabilities

- `local-workspace-application`: 增加 Workspace 级文章入口、文章列表与详情只读投影，以及安全的已登记 Workspace 文章读取边界。

## Impact

- 受影响代码：Local App HTTP server、Web router/navigation、文章列表与详情 feature、Markdown/rendering 复用、静态资源映射。
- 受影响文档：`projects/product/docs/publications/` 及其配图资源。
- 受影响当前知识：Buildr Service 说明补充 Publication Application 与文章入口边界，不承载文章正文。
- 受影响验证：Local App HTTP/integration、Shell 与文章浏览器 smoke；文档质量检查。
- 不增加数据库表、文章 writer、平台发布 adapter 或外部网络依赖；文章读取只访问已解析的 canonical Workspace 文档路径。
