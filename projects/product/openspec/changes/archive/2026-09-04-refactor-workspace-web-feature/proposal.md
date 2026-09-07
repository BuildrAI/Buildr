## Why

Buildr Web 中 Workspace、Project、Service 已是独立产品领域，但页面仍散落在通用 `pages/` 与 `components/`，Project/Service 详情各自复制文档读取、历史和相对链接状态。继续扩展会让领域增删改查职责和页面局部组件边界越来越难判断。

## What Changes

- Workspace、Project、Service 分别迁入独立前端功能（Feature）目录，不合成单一 Workspace 大功能。
- Project/Service 的页面、编辑弹层和领域局部组件归所属 Feature。
- 仅对真实复杂状态抽取 Hook：Workspace 目录、Service 目录和 Project/Service 共享 Markdown 文档导航。
- Project Daily Progress 保持独立 Feature，由 Project 详情组合使用。
- 保留共享 `workspaceApi`、路由路径、稳定 DOM、文案和可见行为。

## Capabilities

### Modified Capabilities

- `buildr-web-service`: 明确 Workspace、Project、Service 前端按领域 Feature 组织及共享边界。

## Impact

影响 `buildr-web/src/pages`、页面局部组件、App 路由导入和前端架构验证；不改变后端 API、DTO、路由 URL、样式、用户数据或构建交付边界。
