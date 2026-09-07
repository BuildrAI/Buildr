## Context

Workspace、Project、Service 页面已经分别承担目录、详情和编辑职责，但源码仍处于通用 `pages/` 与 `components/`。Project/Service 详情各自维护同构的 Markdown 文档加载、路径、历史、返回和错误状态；Workspace 与 Service 目录也包含多阶段请求和状态流。文件体量不是唯一标准：小而单一的页面无需继续切碎，跨领域重复或多阶段状态才需要抽取。

## Goals / Non-Goals

**Goals:**

- Workspace、Project、Service 各自拥有独立 Feature、页面和局部组件。
- 页面入口以路由编排和 JSX 为主，复杂请求/状态进入领域 Hook。
- Project/Service 共享同一 Markdown 文档导航 Hook，不复制状态机。
- Daily Progress 保持独立职责并由 Project 页面组合。
- 保持公开路由、DOM 钩子、文本、API 调用和用户行为不变。

**Non-Goals:**

- 不合并三个领域的增删改查或建立统一 CRUD 框架。
- 不拆分共享 `workspaceApi`，不引入全局 Store 或新依赖。
- 不重做 UI、样式、路由设计或后端接口。
- 不因文件行数机械拆分小页面和展示组件。

## Decisions

### 1. 三个领域分别形成 Feature

建立 `features/workspace`、`features/project`、`features/service`。各目录拥有本领域路由页面、局部组件和必要 Hook；App 只导入页面入口。共享 `api/workspace.ts` 继续作为同一 HTTP 能力 Client，不按页面复制。

### 2. 只抽取真实状态边界

Workspace 目录的 registry 加载、单实例跳转、选择与移除形成 `useWorkspaceCatalog`；Service 目录的 Project 选择、query 同步和两阶段加载形成 `useServiceCatalog`。Project 列表和编辑页当前职责可维护，不为目录对称补 Hook。

### 3. 文档浏览状态共享，领域渲染仍独立

Project/Service 详情共享 `useMarkdownDocumentViewer`，统一文档加载、路径、历史、返回、loading 和错误状态。请求 URL、缺失文案、Tab 和领域事实仍由各详情页提供，避免形成万能详情组件。

### 4. Daily Progress 保持独立

`DailyProgressPanel` 迁入 `features/project-daily-progress`，不并入 Project CRUD Hook，也不成为通用组件。Project 详情只组合该功能。

## Risks / Trade-offs

- [迁移路径导致路由或测试失效] → App 保持相同 Route 声明，更新静态架构检查并运行 Browser/系统验证。
- [共享 Hook 抹平领域差异] → Hook 只接受 fetcher 与错误文案，领域 URL、Tab 和 DOM 留在页面。
- [过度拆分] → 只新增三个有复杂状态的 Hook，不为 Project 列表、编辑页和小组件建立对称空层。

## Migration Plan

1. 建立三个领域 Feature 和独立 Daily Progress Feature，迁移页面与局部组件。
2. 抽取 Markdown 文档导航、Workspace 目录和 Service 目录 Hook。
3. 更新 App imports、架构文档、当前知识和结构验证。
4. 运行前端类型/构建、Browser 与完整受影响验证。

## Open Questions

无。
