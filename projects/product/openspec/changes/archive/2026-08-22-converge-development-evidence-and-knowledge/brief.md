# 研发证据流与知识收敛

一句话摘要：让 Task Candidate 成为稳定内容身份，Formal Verification、Completion Review、Current Knowledge 与 immutable Handoff 围绕同一 Candidate 聚合，同时只允许可独立核验的 execution authority 进入正式 Verification Result。

## 背景与问题

现有 Development 已拥有完整的专业节点，但 Verification-before-Candidate 固定了 Agent 工作顺序；Verification `record` 接受调用方提交的 outcome/facts，无法证明来源；Current Knowledge 只作为验证前建议，无法在 handoff 中区分真正阻塞完成的冲突与解释性 drift。

## 目标与非目标

目标是 Candidate-first 的 current 证据闭环、受控 Verification reconciliation、handoff 前的 Current Knowledge 分类，以及旧 schema 的诚实兼容读取。

非目标是外部系统 provider 平台、legacy Parent correction、Buildr Web UI、测试框架重构、Product Candidate 或 Release 流程优化。

## 受影响用户或角色

- Agent：可以按任务风险与成本组织实现、Review、Verification 和知识收敛，不被固定阶段顺序约束。
- 人：只在真实风险或 completion-critical 冲突需要判断时介入，不负责解释内部 receipt 或 claimed evidence。
- Buildr：继续维护长期 authority、可独立核验 evidence 与 handoff 不变量。

## 核心流程

Agent 完成语义与 OpenSpec convergence后观察 stable Content Target并记录 policy，Development 冻结 Task Candidate；正式 runner把 Candidate 绑定进 Execution Record，Task Verification Application从 matching terminal authority对账 current Result；Completion Review与Current Knowledge disposition可按风险前后组织，最终由Development聚合为proceed decision与immutable handoff。

## 关键变化

- Candidate 不再证明Verification已完成，只证明稳定内容与policy身份。
- Verification Result current writer升级为v2，绑定Candidate和每项evidence authority。
- `reconcile`只消费可独立读取的matching Verification Execution Record，不接受自由文本claim。
- Current Knowledge使用`aligned|not-applicable|attention|blocked`，只有会造成错误完成结论的冲突阻止handoff。

## 影响、风险与兼容性

旧v1 Verification Result继续可读但不能作为新Candidate的current gate，也不自动回填。已清理或不完整的Execution Record无法对账，需要重新形成可核验authority。Current Knowledge修改delivery bytes时必须重新观察Content Target并使旧Candidate与专业evidence失效。

## 验收摘要

- Candidate可在Formal Verification前freeze，Verification与Completion精确绑定Candidate。
- claimed success、旧Candidate、旧target、错误declaration或不可读authority均零写入失败。
- attention不阻止handoff，completion-critical conflict必须阻止handoff。
- 旧v1、current v2、CLI/internal routes、Skills/contracts与canonical knowledge保持一致。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-development/spec.md`
- `specs/task-verification/spec.md`
- `specs/current-knowledge-maintenance/spec.md`
- `tasks.md`
