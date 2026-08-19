# 父任务推进引导与协调视图改进

## 一句话摘要

让父任务页面先回答当前能否推进、下一步是什么以及哪些 Contribution 可启动，并用 Parent Plan 已保存的计划结果和稳定编号共同标识每个候选项。

## 背景与问题

现有 Parent Coordination 区块把最终集成验收缺口标成“前置条件未满足”，没有优先呈现 startup readiness、推荐动作、eligible Contribution 与真实 blocker；Planning Review 又读取了错误字段，页面会显示 `undefined`。用户因此难以判断父任务当前应启动哪个 Child，也无法仅凭编号理解 Contribution 的实际含义。

## 目标与非目标

目标是把当前推进状态、下一步、名称与编号、真实阻塞和最终验收进度分层展示，并保持 Child 承担与交付证明可见。名称直接复用 Parent Plan 的 `summary`，不维护前端名称字典。非目标是不新增进度存储或 writer，不自动创建、完成、接受任何 Child/Contribution，也不改变 Parent Plan 与 Contribution Handoff 持久化 schema。

## 受影响用户或角色

- 从父任务页面决定下一项重构工作的用户和 Agent。
- 维护 Parent Coordination Application 与 Buildr Web Task 详情的产品开发者。

## 核心流程

用户打开采用 Parent Plan 的 Task 详情后，先看到当前是否可推进和推荐下一步；推荐及其他可启动项同时展示计划结果与稳定编号。等待依赖项和治理 blocker 分开说明。全部 Contribution 的处置只形成最终验收进度；Child 顶层状态、planned 范围和 handoff 证明继续作为独立事实展示。

## 关键变化

- Parent Coordination response-only startup projection 追加依赖等待事实。
- Buildr Web 抽出显式类型的协调面板并调整信息层级。
- Contribution 使用 `summary` + `id` 展示，不生成平行名称 authority。
- Planning Review 按公开 read model 正确读取 outcome、applicability、摘要与时间。
- 历史 Task 空态、既有路由、同源托管、离线 CSP 和 writer authority 保持不变。

## 影响、风险与兼容性

变更涉及 Buildr Parent Coordination Application 的只读响应和 buildr-web Task 详情。新字段为可选的 response-only additive fact；旧客户端和旧响应均可兼容。主要风险是长 summary 增加信息密度，以及浏览器重新解释 Application 语义；分别通过响应式布局和仅消费派生字段控制。

## 验收摘要

- 页面明确区分 startup readiness 与 final acceptance readiness。
- 推荐及其他 eligible Contribution 同时显示 `summary` 和 `id`。
- 有其他 eligible 项时，等待依赖的 Contribution 仍可被识别。
- Planning Review 不显示 `undefined`。
- Parent Plan 模式与 legacy 空态通过生产托管 browser smoke。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [delta specs](specs/)
