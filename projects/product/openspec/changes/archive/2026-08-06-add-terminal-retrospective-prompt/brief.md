# 终态任务复盘提示

一句话摘要：正式 Task 完成或放弃后，结束任务的 Agent 会非阻塞地询问用户是否进行“任务复盘”，Token 数据只在可信可得时记录。

## 背景与问题

Task Retrospective 已支持把终态 Task 的执行效率复盘写入 SQLite，但终态流程没有稳定提示，用户容易不知道这一能力。不同 Agent host 又不一定暴露 Token 用量，强求完整数字会诱发额外回放、估算或采集成本。

## 目标与非目标

目标是让 Task Record 和 Task Finish 的成功终态结果提供一致的可选复盘建议，并让相关 Skills 正确呈现和路由。非目标是新增复盘门禁、自动执行、数据库字段、Token 估算器、后台采集或 Local App 写入口。

## 受影响角色

- 使用 Buildr 结束正式 Task 的用户：在终态响应中看到是否复盘的明确选择。
- 结束 Task 的 Agent：只呈现建议，用户同意后再加载 `task-retrospective`。
- 复盘 Agent：按可得、部分可得或缺失记录 Token 证据，不为补齐数据增加消耗。

## 核心流程与关键变化

Task Record `complete|abandon` 或 Formal Finish 成功后，产品结果返回“任务复盘”建议；Agent 先报告已成立的终态结果，再询问用户是否复盘。用户未同意时不调用复盘能力，提示缺失、拒绝或复盘失败都不改变终态。blocked 路径继续优先返回原有恢复动作。

## 影响、风险与兼容性

变更复用现有 `nextActions`/`nextAction` 字段和现有 schema version，无 SQLite migration。可能依赖 complete `nextAction` 为空的 consumer 通过回归测试收敛；不支持结构化结果提示的 runtime 由随包 Skill 保证用户可见行为。

## 验收摘要

- completed、completed no-change、abandoned 与 Formal Finish complete 都提供非阻塞“任务复盘”建议。
- blocked/failed 不误报可复盘，既有恢复动作保持优先。
- Token 完整、部分和缺失三种情况都有明确证据口径，不强制估算或额外采集。
- CLI、随包 Skills、runtime 投影与 current knowledge 一致，相关测试及 formal Verification 通过。

## 技术 artifacts

- [proposal.md](proposal.md)
- [design.md](design.md)
- [specs/agent-task-workflows/spec.md](specs/agent-task-workflows/spec.md)
- [specs/task-retrospectives/spec.md](specs/task-retrospectives/spec.md)
- [tasks.md](tasks.md)
