# 精简 Task Board Skill

## 摘要

在保持 `buildr.task-board-maintenance/v1`、模板 schema 和 consumer binding 不变的前提下，把随包 `task-board` Skill 收敛为更短、更结构化且操作结果确定的任务看板维护手册。

## 背景与问题

当前 Skill 的任务模型与事实边界正确，但 routing、页面内容、操作步骤、检查和结果契约存在重复；当前回复还有旧名称残留，既有看板的后缀 glob 查找也可能匹配到错误 task identity。

## 目标与非目标

- 目标：简化并统一 description，按执行顺序重组正文，明确唯一 identity、create/update、候选验证和失败保留语义。
- 非目标：不升级 capability contract，不改变模板 JSON schema、视觉设计、consumer binding 或历史 `task-cockpits/` 页面。

## 核心流程

Agent 判断适用范围后，核实 Project、task identity、授权和事实来源；精确定位唯一看板，生成候选并验证 task identity、JSON、关系、离线和只读约束；最后返回 `created|updated|aligned|blocked` 及 contract 要求的证据。

## 关键变化

- description 只承担 routing，并在三个发布入口保持一致。
- 正文使用六段连续结构，删除重复检查和契约复述。
- 文件名与 `meta.taskId` 必须共同证明唯一既有看板。
- 候选验证失败或写入失败时保留原文件；无变化返回 `aligned`。
- 新产物和当前回复统一使用“任务看板”。

## 影响与风险

影响随包 Skill、发布 manifest、delta spec 和静态测试。主要风险是压缩时遗漏低频边界，或更严格的 identity 检查暴露历史异常文件；通过 contract/spec/template 对照和 fail-closed 结果降低风险。

## 验收摘要

Skill 明显缩短且无重复章节；routing descriptions 一致；唯一 identity、候选验证、历史页面保护、真实 change、批次和依赖池语义均有静态与契约证据；受影响验证和最终 Candidate 通过。

## 技术入口

- `proposal.md`
- `design.md`
- `specs/task-board/spec.md`
- `tasks.md`
