## Context

多 Project Task 已使用一个 Task Record、一个 Task Environment、一个聚合 Content Target、一个 Development policy/Candidate 与一个 Verification Result。Project 级 Verification Plan 和 Execution Record 则保持独立。当前实现的问题不是缺少更大的聚合对象，而是多个独立 Project authority 在 Environment、Result、Current Knowledge 和 Finish 交接处被错误折叠成单值。

## Goals / Non-Goals

**Goals:**

- 保持每个 Project 一份 closed Verification Plan，不新增“合并 Plan”。
- 让一次 Task 级 Result 精确聚合每个 Project 的独立 terminal authority。
- 让 Environment capability preparation 使用全部 Project requirements 的精确闭包。
- 让 Current Knowledge 和 Finish 对多 Project/多 repository scope 保持完整、可恢复。
- 让任务创建基线尊重每个 repository 的真实 integration branch/remote。

**Non-Goals:**

- 不新增 SQLite 表、Plan store、通用多 Project DAG 或跨机器同步。
- 不让 Verification 读取或写 Development Receipt。
- 不让 Task Finish 解释 Verification Plan、Result 或 Current Knowledge。
- 不改变一个 Task 只有一个 Candidate、Result 和 immutable handoff 的模型。

## Decisions

### 1. Project 是 Verification Plan 聚合键

Result reconciliation 以 `summary.project.code` 分组。每组内部要求相同 request/plan/provider，组间只共享 Task、Candidate、Content Target。相比构造合并 Plan，这保留现有 Project declaration/provider ownership，并避免引入第二规划 authority。

每个有效 Project 必须由以下一种事实覆盖：

- 至少一个 matching terminal Execution Record，且所选 checks 完整覆盖该 Project record 声明的 selected capabilities/execution units；
- 明确的 `project:<code>` coverage gap；
- Service gap 只能补充 Project record，不能单独冒充整个 Project 已覆盖。

### 2. Environment 接收完整 preparation closure

Task Verification 在持有全部 Project Formal Plans 时形成一次去重排序的 requirements 并集，再生成唯一 closed Environment Plan Request。Task Environment 继续整值写 Plan，不在 writer 内盲目累积历史 requirements。这样 Plan 变化会删除陈旧 requirement，而不是永远追加。

单 Project preview 仍可返回本 Plan closure；多 Project formal workflow 必须消费聚合投影形成的完整 request，不能依次提交会相互替换的局部 request。

### 3. Candidate 绑定 policy，不持久化 Plan 集合

安全不变量保持为：Development policy 中每个 required capability 必须在 current Verification Result 中有 matching passed/failed fact，每个 policy gap 必须被 Result 覆盖。Candidate 继续绑定 policy identity。

Plan identity 只属于 Execution Record；“复用同一 Plan”是避免重复执行和保证 record 内部 currentness 的执行约束，不成为新的长期 Task authority。Result reconciliation 按 Project 验证 record 自身 Plan closure，Development 再按 policy 验证 required facts。

### 4. Current Knowledge 保存 Project dispositions

Development `currentKnowledge` 增加按 Project 排序、不可重复的 dispositions，并要求精确覆盖Task有效 Project集合。每项保存 project、status、summary、source identities 与 bounded unresolved items；顶层状态由各项目确定性聚合。仅工作区 Task 保持独立负向形态。

相比继续依赖无类型 `sourceIdentities`，该模型可以证明没有遗漏 Project，同时不复制知识正文。

### 5. shared Environment 只补 delivery context

Delivery reconciliation 遇到 ready Environment 但 `repositories=[]` 时，继续保留该 Environment 的 execution/cleanup identity，只从 frozen handoff scope、registry 与 Git topology 重建 repository plans。自动 Finish 仍要求实际 provider repository set，不使用此 fallback。

### 6. Git 基线逐 repository 解析

task-triage 先从 Project/Service registry、当前分支/upstream和明确用户输入解析每个 repository 的 integration branch/remote。只有 identity 唯一时才 fetch/rebase；不能解析时阻塞。不得把某个 Workspace 的 `dev` 默认扩展到全部 Service repositories。

## Risks / Trade-offs

- [Result 放宽跨 Project Plan identity 后误接纳部分记录] → 强制有效 Project 精确覆盖，并保留 Project 内 Plan 一致性。
- [Environment 聚合 closure 引入陈旧 requirements] → 从当前完整 Plan documents 每次整值重建，不合并历史 Plan。
- [Current Knowledge schema 变化影响旧 Receipt] → 旧 Receipt 只读兼容为 legacy aggregate，不能满足新的多 Project handoff；单 Project 可确定性投影。
- [shared Environment fallback 选择错误 repository] → 仅用于 reconciliation，复用现有 registry/Git 唯一解析与远端包含证明；有歧义零写入。
- [逐 repository branch 解析扩大 Git 自动操作] → 只接受声明或当前 upstream 唯一事实，保留 clean/no-stash/no-force-push 边界。

## Migration Plan

1. 先更新规范、契约与 Skills，明确 per-Project 聚合不变量。
2. 修改 Environment closure 与 Verification reconciliation，并用真实 SQLite/Execution Record Integration tests 固化。
3. 升级 Development Current Knowledge 的兼容 reader/writer。
4. 修复 Finish fallback 与 task-triage 指引。
5. 增加三 Project 黄金流程，验证旧单 Project、仅工作区和多 repository 路径不回归。

## Open Questions

无。当前选择保持 Plan transient、policy/Candidate durable 的既有 authority 边界。
