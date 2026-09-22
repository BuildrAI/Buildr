## Why

文章当前只读展示单个 Product 项目的发布材料，缺少常规编辑、跨项目检索和图片附件管理。用户已确认完整界面原型，并明确要求把图片或附件上传到 `assets/` 后在文章中引用。

## What Changes

- 按已确认原型实现文章目录、阅读、新建、编辑、删除确认、收藏、导出与写作请求交接。
- 以工作空间、项目和文章标识确定同一对象；保留旧 Product 文章地址及 `assets/...` 引用。
- 提供有界图片和附件上传、资源列表与插入引用，保留既有正文元数据及平台记录。
- 通过当前文件摘要保护更新和删除；上传不覆盖旧资源，删除文章不连带删除共享资源。
- 项目只展示关注，文章和资料展示收藏；已有偏好继续保存。
- 无破坏性文件迁移，不包含外部平台发布或自动启动智能体（Agent）。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-workspace-application`：文章从只读投影扩展为受控编辑、跨项目阅读和资源管理。
- `daily-workbench`：区分项目关注与资料收藏，并保持既有偏好兼容。

## Impact

涉及 `services/buildr/src/modules/publication/`、窄范围 HTTP 请求与二进制响应支持、`services/buildr-web/src/features/publication/`、路由、收藏引用校验及相应测试。内容仍存放所属项目的 `docs/publications/`，不建立数据库正文副本，不新增依赖。原型来源为 `docs/prototypes/article-workspace.html`。
