# 让文章能被编写、阅读和接续

文章从单个项目的只读页面扩展为跨项目目录和完整编辑体验。正文仍来自所属项目 `docs/publications/`，图片和附件保存在 `assets/`，用户能上传、预览并插入引用；保存与外部修改发生冲突时保留输入。

人选择项目、编写和验收内容；智能体（Agent）通过带来源与版本的工作请求接续起草、润色或审校；应用保护对象身份、文件边界和版本。平台发布记录保留，复制写作请求不会启动执行。

本次兼容旧Product文章链接和资源，不迁移正文、不删除共享附件、不自动发布。验收以真实文件、HTTP与生产页面中的上传保存重开为准。

当前知识影响已评估：`knowledge/docs/architecture/technical.md`、`knowledge/docs/services/buildr.md`、`knowledge/code-map/modules.md` 与 `knowledge/code-map/calls-data-effects.md` 的 Publication 只读表述将需要校准。本轮先校准此说明、规范与实际功能；现有大范围知识资产维护未获单独授权，不因该提醒阻塞实现。

方案：[proposal.md](proposal.md)、[design.md](design.md)、[tasks.md](tasks.md)。已确认原型：[完整页面](../../../../docs/prototypes/article-workspace.html)。
