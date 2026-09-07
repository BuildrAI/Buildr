## 1. 领域 Feature

- [x] 1.1 将 Workspace 页面迁入独立 Feature，并按目录状态边界抽取 Hook
- [x] 1.2 将 Project 页面、编辑弹层与页面局部组件迁入独立 Feature，保留小文件职责
- [x] 1.3 将 Service 页面、编辑弹层与页面局部组件迁入独立 Feature，并按目录状态边界抽取 Hook
- [x] 1.4 将 Daily Progress 保持为独立 Feature，由 Project 详情组合

## 2. 共享状态与装配

- [x] 2.1 抽取 Project/Service 共用 Markdown 文档导航 Hook，领域页面保留请求和渲染差异
- [x] 2.2 更新 App 路由导入与架构验证，拒绝三个领域页面回流通用 pages/components

## 3. 当前认知与验证

- [x] 3.1 更新 Brief、Service架构文档和current knowledge
- [x] 3.2 运行前端类型/构建、Browser、OpenSpec与完整受影响验证
