## Context

现有 Publication 模块从 Product 项目的 Markdown 前置元数据与正文读取内容，既有图片使用 `assets/...`，由同源二进制接口提供。已确认的完整界面在 `docs/prototypes/article-workspace.html`，用户追加了图片和附件上传引用要求。

## Goals / Non-Goals

目标是人与智能体（Agent）接续同一项目文件，用户能直接编辑、管理引用并观察版本冲突。外部平台发布、自动执行模型和通用媒体库不在本轮范围。

## Decisions

- 稳定身份采用 workspaceId、projectCode、publicationId；新增项目限定 API，旧 Product URL 和收藏 key 保持兼容。项目来源按已登记信息解析，只接受当前工作空间内的受控 workspace/git 来源，局部不可用不阻塞聚合。
- 新建与修改共用项目文件来源，revision 对完整文章文件计算；更新只修改支持字段并保留未知元数据、平台记录与已有资源引用。使用已有文件 mutation 边界与版本复核，页面冲突保留输入。
- 接口为 GET /publications 聚合，GET/POST /projects/:projectCode/publications，GET/PUT/DELETE /projects/:projectCode/publications/:id，以及该文章 /assets 的 GET/POST 与受控资源 GET。写入字段使用 revision。
- 上传以 JSON Base64 传递，沿用鉴权与请求读取；正文请求限 1 MiB、上传请求限 14 MiB，其他接口维持原上限。图片允许 PNG/JPEG/GIF/WebP 且上限 5 MiB，核对图片签名；附件允许 PDF/TXT/MD/CSV/JSON/ZIP/DOCX/XLSX/PPTX 且上限 10 MiB。拒绝 HTML/SVG/JS 等主动内容。非图片以附件下载提供。
- 所有目录祖先逐段拒绝符号链接、路径逃逸；上传生成唯一名称并排他写入。上传独立于正文保存，删除文章保留可能共享的 assets，避免误删。
- 原型主流程复用现有 WorkspaceStage、页签、Ant Design 与 Markdown 渲染；列表、阅读、编辑各承担明确职责。资源面板分本文引用与项目资源，上传后可插入 `![说明](assets/...)` 或 `[附件](assets/...)`。
- 写作抽屉组织起草、润色、审校和改写目标，带上真实项目、sourcePath、revision 和材料并生成可复制请求。请求生成不是执行，也不声称已有专项技能；智能体仍使用现有文件与专业工具。

## Risks / Trade-offs

- 共享 assets 无法仅按单篇删除安全回收 → 保留资源，本轮不实现自动清理。
- 外部编辑造成过期内容 → 版本拒绝覆盖并保留浏览器草稿，显式对照后再保存。
- 聚合项目来源不同 → 按来源身份逐项检查，未知或不可用项目给局部诊断。
- 大文件增加内存 → 限定类型和体积，限制只放宽相应路由。

## Migration Plan

无需迁移现有文章；新增摘要使用可选字段，旧文档正常显示。回退代码不会删除新增 Markdown 或 assets。新增行为上线前用生产构建和隔离工作空间验收。
