# 对外文章材料与 Local App 文章入口

## 一句话摘要

把已发布墨问文章及配图收敛为项目内的 `docs/publications/` 源材料，并在 Local App 增加独立的只读“文章”入口。

## 背景与问题

项目需要逐步引入协作者并对外输出内容。文章应先在项目内维护，再发布到墨问、微信公众号等平台；当前两篇文章已有外部页面，但配图依赖外部临时资源，Local App 也没有统一的文章阅读入口。

## 目标与非目标

目标是保存文章正文、发布目标元数据和本地配图，提供 Local App 文章列表/详情/图片的只读投影。非目标是编辑文章、执行外部平台发布、建立文章数据库或把已有产品文档迁移到发布材料目录。

## 受影响用户或角色

项目维护者和协作者通过项目文件维护文章，通过 Local App 浏览待发布或已发布材料。

## 核心流程

文章源文件和配图进入 Product Project 的 `docs/publications/`，Local App 从已登记 Workspace 解析固定目录并读取文章；发布平台状态和链接仅作为文章元数据展示，不由 Local App 修改。

## 关键变化

- `docs/publications/` 成为对外文章材料源，并允许记录多个发布目标。
- 配图保存为项目内相对资源。
- Local App 增加 Workspace 级“文章”导航、列表、详情和受控图片读取。

## 影响、风险与兼容性

新增 Local App read model、HTTP 路由和 Markdown 本地图片渲染；不新增数据库、writer 或平台 adapter。资源读取固定在 publication root 内，并拒绝任意路径、路径穿越和符号链接。

## 验收摘要

文章和配图文件可被文档质量检查发现；Local App 能展示列表、详情、发布目标和本地图片，并对空目录、缺失文章和越界资源稳定失败；相关单元、集成和浏览器冒烟测试通过。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta Specs](specs/)
- [Tasks](tasks.md)
