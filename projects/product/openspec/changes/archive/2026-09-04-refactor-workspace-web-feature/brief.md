# 收敛 Workspace 前端功能切片

## 一句话摘要

Workspace、Project、Service 各自形成独立前端 Feature，只把真实复杂状态和跨领域重复抽成 Hook。

## 背景与问题

三个领域页面散落在通用 `pages/` 与 `components/`，Project/Service 详情重复维护 Markdown 文档浏览状态，后续增删改查扩展容易混淆领域所有权。

## 目标与非目标

按领域迁移页面、局部组件和必要 Hook，保留共享 `workspaceApi`、独立 Daily Progress、路由、稳定 DOM 和可见行为。不合并三个领域，不引入统一 CRUD 框架或全局 Store，也不按行数机械拆小文件。

## 核心结构

App 路由 → Workspace / Project / Service Feature 页面 → 领域 Hook 或共享文档 Hook → 共享 workspaceApi。

## 验收摘要

三个领域源码归属清晰；通用 `pages/components` 不再保存其页面和局部组件；只有复杂状态被抽取；适用前端、Browser、OpenSpec和受影响验证通过。

## 技术产物入口

- `proposal.md`
- `design.md`
- `specs/buildr-web-service/spec.md`
- `tasks.md`
