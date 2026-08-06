## Context

Local App 已有两套 Change 入口：全局 `/changes` 目录与详情页，以及 Task-scoped Change resolver。前者把 Change 作为用户先进入的资源，并允许页面生成创建、继续、审查和关联的 Agent prompt；后者只把关联 Change 显示为 Task Record 中的一项技术链接。用户确认应由 Task 组织工作上下文：Brief 是概览的主要内容，Change 的维护仍是 Agent 的专业动作，Local App 只读取已关联的事实。

## Goals / Non-Goals

**Goals:**

- 只从 Task 详情阅读关联 Change，并以可用 `brief.md` 为概览主内容。
- 保留 OpenSpec 的 Change source authority、Task Record 的引用 authority 和 Task-scoped Resolver 的安全解析边界。
- 移除使 Local App 成为 Change 管理客户端的导航、全局读取和 prompt/mutation 表面。

**Non-Goals:**

- 不创建 Task Brief、第二份 Change 存储或新的聚合 writer。
- 不显示、扫描、关联、修复或处置未关联真实 Task 的 Change。
- 不让 Local App 创建、修改、继续、审查、归档或同步 Change，也不改变 Agent 的 OpenSpec 工作流。
- 不改变 Task 的 Parent/Child、Environment、Development、Review、Verification 或 Finish authority。

## Decisions

### 1. Task 概览读取关联 Change Brief，而不是复制 Brief

Task 详情只使用 Task Record 已保存的 `{project, change}` 引用逐项调用 Task-scoped Change Resolver。每个可读取 Change 的 `brief.md` 作为概览中的主要人类可读内容；没有 Brief 或解析不可用时显示其真实状态，不生成摘要。保留任务 title 和 intent 作为身份与范围说明，但不再让技术引用卡取代 Brief。

备选方案是在 Task Record 或 SQLite 中复制/缓存 Brief。该方案会增加第二个内容 writer、同步与 currentness 问题，因此不采用。

### 2. Change 只作为 Task-scoped 只读子资源

移除全局 Change 页面、导航、HTTP 路由与 Change-specific Agent actions。关联 Change 的完整 artifacts 仍从 `/tasks/<task-id>/changes/<project>/<change>` 读取，并始终验证该引用属于当前 Task。HTTP/Web 不提供 `addChanges`、`removeChanges` 或 Change prompt 的 Local App 入口。

备选方案是保留隐藏的全局页面或只隐藏菜单。它仍会保留与 Task 平行的用户入口和无 Task Change 的产品语义，因此不采用。

### 3. 未关联 Change 保持为 Agent/文件系统事实

本次不把历史或孤立 Change 迁移到 Task，也不引入待关联 inbox。它们不出现在 Local App；Agent 在正式 Task 流程中决定是否创建或引用 Change。

## Risks / Trade-offs

- [一个 Task 关联多个 Change] → 概览按 Task Record 的已保存引用逐项展示 Brief；不推断主 Change 或合并内容。
- [Brief 缺失或 Change resolver 不可用] → 保留 Task 可读，显示明确 unavailable 状态，不回退全局扫描。
- [旧 `/changes` 链接失效] → 作为明确 breaking change 返回稳定不存在结果；迁移入口是其关联 Task 的详情页。
- [页面失去 Change prompt] → 这符合 Change 由 Agent 推进的边界；Task 的一般 Agent 交接不受影响。

## Migration Plan

1. 先交付 Task-scoped Brief 概览与全局入口移除，并覆盖关联、无 Brief、无 Change 和全局旧路由场景。
2. 已有关联 Task 无需数据迁移，打开 Task 即可读取现有 Change。
3. 不关联历史孤立 Change；后续仅在实践证明需要时另行设计其处理方式。
