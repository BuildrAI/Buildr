## Context

Task页面已经位于独立feature，但目录仍叫`task-record`，`TaskDetailPage`有594行并维护约30项状态。`useTaskDetail`和`useTaskMutations`只返回Client函数，组件还通过伪Hook取得后端能力，偏离现有前端分层约束。

## Goals / Non-Goals

**Goals:**

- 内部功能命名统一为`task`。
- 页面只编排路由、Tab、Hook和组件。
- 数据读取、动作、关联产物和复盘分别由真实Hook管理。
- 所有Evidence数据使用生成DTO。

**Non-Goals:**

- 不改变HTTP路由、公开JSON identity、`record`字段或Task Record领域术语。
- 不改变页面布局、文案、稳定DOM selector和操作结果。
- 不引入全局Store或新的前端依赖。

## Decisions

1. feature目录使用`features/task`，但生成DTO继续名为`task-record-dto.ts`，因为它表达公开Task Record协议，不是内部模块名。
2. `useTaskDetail`负责Workspace与详情读取；`useTaskActions`负责编辑、完成、放弃及其草稿；`useTaskArtifacts`负责Change Brief、原型和项目文档；`useTaskEvidence`保持Review、Verification和Parent Coordination局部失败隔离。
3. 复盘组件通过`useTaskRetrospective`访问Client；文档预览组件通过props接收加载函数，组件不直接取得服务器数据能力。
4. 保持`pages/hooks/components/api`四个平级目录，不新增`model`、`logic`或按页面再分层。

## Risks / Trade-offs

- [Hook拆分时请求取消或刷新时序变化] → 复用现有`TaskReadLifecycle`，保留按Task和operation去重、取消及generation检查。
- [目录重命名导致生成DTO落到旧路径] → 同步修改DTO生成器目标和fresh-build inventory测试。
- [重构破坏浏览器选择器] → 保留原有DOM id、路由和交互，并运行Buildr Web构建、组件测试与相关契约测试。
