## Context

Parent Coordination 已由 Buildr Application 基于 Task Record、Parent Plan、Planning Review、Child Task 与 Contribution Handoff 动态派生。当前 Buildr Web 只展示 Parent outcome、Plan identity、一个误标为“前置条件”的 final acceptance 布尔值和扁平 Contribution 表；它没有把 `startup.status`、`startup.next`、`startup.eligibleContributions` 与真实 `startup.blockers` 放到用户决策路径中，并且错误读取 Planning Review 字段，导致页面出现 `undefined`。

2026-08-18 的界面方向已由用户确认：父任务页面首先回答“现在能否推进、下一步做什么、有哪些可启动项、真正被什么阻塞”，可启动项必须同时显示名称与编号；最终验收、计划身份和治理摘要退居次要层级。现有 Ant Design 5、同源 `web-dist`、离线 CSP 与稳定路由继续作为视觉和运行边界。

## Goals / Non-Goals

**Goals:**

- 让 Parent Coordination 首屏明确呈现当前推进状态、下一步、可启动 Contribution 和真实启动阻塞。
- 使用 Parent Plan 中保存的 `summary` 作为用户可读名称/计划结果，同时展示稳定 `id`；不在前端维护 Contribution 名称字典。
- 把 Contribution 尚未全部交付表达为最终验收进度，不与当前启动 readiness 混淆。
- 正确展示 Planning Review 的 outcome、applicability、摘要与时间。
- 保留 Child 承担、Task 状态、planned Contribution 和 handoff 证明，且保持所有 writer authority 不变。

**Non-Goals:**

- 不新增 Parent progress store、第二套 Task writer 或前端派生的专业生命周期。
- 不自动创建、完成、放弃 Child，不自动接受 Contribution，也不在页面内执行专业任务。
- 不修改 Parent Plan 或 Contribution Handoff 的持久化 schema。
- 不引入新组件库、依赖、CDN、远程字体或远程脚本。

## Decisions

### 1. 继续消费单一 Parent Coordination read model

Buildr Web 继续调用 `/api/v1/tasks/:taskId/coordination`。Parent Coordination Application 可以在既有 `startup` 对象中追加 response-only 的 `dependencyBlockers`，以便页面在仍有其他 eligible Contribution 时也能解释哪些 Contribution 正在等待依赖。该字段完全由 Parent Plan dependency 和当前 Contribution disposition 计算，不落库、不改变已有字段语义。

备选方案是在浏览器根据 Parent Plan 与 Contribution disposition 重算依赖。该方案会把 Application 决策复制到客户端，因此不采用。

### 2. 名称来自保存的 summary，编号来自稳定 id

页面把 Contribution `summary` 作为主要用户可读名称/计划结果，把 `id` 作为单独的稳定编号标签。推荐项、其他可启动项、Contribution 列表和 Child planned Contribution 均复用同一映射。

备选方案是为已知 id 维护中文名称字典，或从 kebab-case 自动翻译。两者都会形成并行名称 authority，无法覆盖未来 Parent Plan，因此不采用。

### 3. 当前推进与最终验收分层

协调面板首层展示：

1. 当前推进状态：来自 `startup.status`；
2. 推荐下一步：来自 `startup.next`；
3. 推荐及其他可启动 Contribution：来自 `startup.next.contributionIds` 与 `startup.eligibleContributions`；
4. 当前阻塞：来自 `startup.blockers`；
5. 最终验收进度：以 delivered/superseded 数量相对全部 Contribution 呈现，并继续展示显式 Parent Acceptance。

`prerequisitesSatisfied` 只解释为 final acceptance prerequisites，不再使用“前置条件”这种启动语义。

### 4. 页面局部组件和显式类型

从 `TaskDetailPage.tsx` 抽出页面局部 `ParentCoordinationPanel`，同时定义公开 read model 所需的显式 TypeScript 类型和纯展示 helper。组件保留 `task-parent-coordination` 稳定 DOM id，并为当前状态、下一步和 eligible 列表增加稳定钩子。

### 5. Planning Review 按公开形状读取

Planning Review 展示读取 `planningReview.result.conclusion.outcome`、`planningReview.applicability`、`planningReview.result.conclusion.summary` 与 `planningReview.result.completedAt`。任一可选字段缺失时显示明确空态，不允许拼接出 `undefined`。

## Risks / Trade-offs

- [summary 可能较长] → 在卡片中允许换行并把 id 作为独立标签；不截断权威计划结果。
- [追加 dependencyBlockers 后客户端版本不一致] → 字段保持 optional，旧响应仍可渲染；不改变现有 schemaVersion 和字段含义。
- [状态分类过度解释] → eligible、dependency waiting、delivery disposition 都只来自 Application read model；未知值按原值降级展示。
- [面板信息密度增加] → 通过主推进卡、可启动区、最终验收区和可折叠/次要治理事实建立视觉层级，并验证 390px 无横向溢出。

## Migration Plan

1. Parent Coordination Application 追加 `startup.dependencyBlockers` 并补充 integration test。
2. Buildr Web 抽出协调面板、接入显式类型与局部样式，保留既有 endpoint 与 DOM 根钩子。
3. 补充前端 contract/integration 与生产托管 browser smoke，构建 `buildr-web` 并验证由 Buildr HTTP server 托管的 `web-dist`。
4. 如需回滚，恢复前端组件调用与 response-only 字段；持久化数据无需迁移或回滚。

## Open Questions

无。名称来源已收敛为 Parent Plan `summary`，不引入新的名称字段或映射表。
