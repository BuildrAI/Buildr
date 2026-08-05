## 1. 文章材料与资源

- [x] 1.1 将两篇已发布墨问文章和发布目标元数据整理到 `projects/product/docs/publications/`，保持文章源与现有文档体系隔离
- [x] 1.2 下载两篇文章配图到 `projects/product/docs/publications/assets/`，更新 Markdown 为本地相对图片引用并检查文件类型、大小和链接

## 2. Publication read model

- [x] 2.1 新增窄 Publication Application，解析固定 Product Project publication root 的文章 front matter、正文和发布目标
- [x] 2.2 实现文章列表、详情和受控图片资源读取，拒绝任意 path、路径穿越、符号链接和 publication root 外文件
- [x] 2.3 将 Publication Application 注册到 runtime，并接入 Local App Workspace API

## 3. Local App 文章入口

- [x] 3.1 增加 Workspace-scoped `/articles` 与 `/articles/:publicationId` 路由、独立“文章”导航项和静态 feature 资源映射
- [x] 3.2 实现文章列表页、文章详情页、空状态、not-found 状态、发布目标信息和渲染/原文视图
- [x] 3.3 扩展 Markdown renderer 的受控本地图片渲染，不放宽外部图片与路径安全策略

## 4. 验证与收敛

- [x] 4.1 增加 Publication Application、HTTP API、路由和 Markdown 图片行为的单元/集成测试
- [x] 4.2 增加 Local App articles browser smoke，覆盖导航、列表、详情、本地图片、空状态和错误状态
- [x] 4.3 运行文档质量、受影响验证和 OpenSpec strict validation，更新 Change 与 Task Development 的当前状态
