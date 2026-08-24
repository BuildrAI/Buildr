---
name: task-retrospective
description: 用户明确要求复盘已完成或已放弃的正式 Task，或要查看、处理、标记无需处理、重新打开已有复盘时使用；复盘重点检查 Agent 执行时间、token 消耗、重复尝试、人机协作或 Buildr workflow/harness 效率。不用于过程 observation、任务审查、门禁或资产自动写回。
---

# Task Retrospective

本 Skill 是 `buildr.task-retrospective/v2` 的默认 provider。Agent负责复盘、当前事实重评与后续承接；Retrospective Application只负责terminal校验与SQLite current Result/处置状态，Task来源关系只通过selected `buildr.task-record/v2` provider维护。

## 1. 恢复任务事实

确认 canonical Workspace 和正式 Task ID，读取 Task Record；Task 必须是 `completed` 或 `abandoned`。使用当前Workspace matching retained Buildr controller invocation执行bundled `inspect`；不得使用candidate `cliInvocation`、resource payload root或checkout内部driver：

```text
<controller-command> <controller-args-prefix...> __internal task-retrospective inspect --task <task-id> --target <canonical-workspace>
```

已有Result可以重做并完整替换；没有Result只是“尚未复盘”。同时读取 `disposition` 与 `currentDigest`；不要打开SQLite；不读取、迁移或删除`.buildr/asset-review/`。

## 2. 生成一份自由复盘

只基于当前session/runtime可访问的任务步骤、工具结果和最终事实，重点寻找：

- 哪些步骤耗时最多或token消耗最大；
- 哪些推理、检索、尝试、验证或恢复发生重复；
- 哪些等待、阻塞或环境准备可以前移、缓存或确定化；
- 哪些选择应更早交给人，哪些可以由workflow/harness直接确定；
- 哪些Buildr引导本身增加了不必要工作量。

报告使用自由Markdown，不要求固定标题、评分、分类或结构化建议。Token 数据按证据可见性处理：可信可得时记录数值、来源和覆盖范围；部分可得时明确覆盖的步骤、阶段或调用及其不代表完整 Task；不可得时直接标记缺失，并继续使用耗时、重复尝试、等待、工具调用和人机协作等可观察事实。不得为了补齐 Token 数字回放完整上下文、读取隐藏推理、强制估算、新增采集流程或增加任务消耗；其他精确成本数据不可见时同样写明缺口并区分观察事实与推断。不得声称读取隐藏推理、完整对话、完整工具日志或后台事件。

用户或团队给出的同类任务耗时参考区间，只作为当前任务复杂度下的比较、解释和优化背景；报告应说明适用范围及偏离原因，不把它固化为通用产品阈值、Result字段、gate、pass/fail标准或自动缩减验证范围的依据。

## 3. 完整后一次写入

报告未完成或任务仍active时不写。完整报告形成后执行：

```text
<controller-command> <controller-args-prefix...> __internal task-retrospective record --task <task-id> --target <canonical-workspace> --report-markdown <markdown>
```

Application会完整替换同一Task的current row；不创建历史、候选或draft。若命令行承载长Markdown存在转义风险，使用安全的进程参数调用方式，不借此新增临时持久化store。

## 4. 处理 current 复盘

用户要求处理多份已有复盘时，先通过一次有界批量只读调用取得默认 `pending` 摘要：

```text
<controller-command> <controller-args-prefix...> __internal task-retrospective list --target <canonical-workspace> [--status <pending|handled|no-action|all>] [--task <task-id> ...] [--limit <1..500>] [--include-report]
```

默认最多返回 100 份 pending 摘要且不包含报告正文；先用摘要收窄对象，只在确实需要批量读取原文时显式使用 `--include-report`，个别全文继续使用单 Task `inspect`。`list` 只减少重复 driver 调用，不自动分析、评分、生成方向、创建 Task 或修改 disposition，也不成为后续 mutation 的授权或门禁。

用户要求处理已有复盘时，再对需要判断的对象使用 `inspect`，在对话中直接给出完整原始 `reportMarkdown`；正文过长或已在同一对话完整展示时可以给出 `currentDigest` 不可变引用，但不能只让用户去 Buildr Web 查。随后读取当前 canonical specs、实现、knowledge 与 open Task，对原问题和建议逐项判断当前是否仍存在、仍有效，再按当前事实重新拆分改进方向；不沿用旧行动项编号，也不生成新 action item ID。

### 4.1 先完成只读讨论

用户只说“处理”“检查”“查看”或“分析”复盘时，只授权只读阶段。Agent 可以 inspect、调查当前事实、重判方向并形成拟处置方案，但不得调用 Task Record `create|update` 或 Task Retrospective `handle`。先向用户完整展示：

- current disposition 与 `currentDigest`；
- 拟 disposition 及完整处置理由；
- 将复用、创建或关联的目标 Task IDs；
- 每一项 Task Record 与 Retrospective mutation effect；没有 Task effect 时明确写 none。

展示后停止写入并等待用户决定。用户继续讨论、要求调整、提出异议、只表示“看看再说”或没有明确接受时，保持 current disposition 和全部 Task Record rows 不变；不得把“处理复盘”推断成 `no-action`、`handled`、`pending` 或创建/关联 Task 的授权。

### 4.2 判断是否已有明确授权

以下任一情况可以进入写入阶段：

1. 用户直接指定了完整 mutation，例如“把这个复盘标记为无需处理，理由是……”，或明确指定 `handled`、处置说明和全部目标 Task effects；完整动作本身就是本次精确 mutation 的明确授权，不再机械要求第二次确认。
2. 用户明确接受 Agent 刚展示的完整方案，且 disposition、理由、目标 Task IDs 与关系 effects 均未变化。

授权只覆盖已指定或已展示的精确 effects。表达不完整或含糊时继续保持只读。实际写入前重新 inspect，并复核 current digest、拟 disposition、处置理由、目标 Task 与关系 effects；任一事实或 effect 发生实质变化时旧授权失效，立即停止后续写入、保持 current disposition、重新展示变化后的完整方案并取得新授权。若已有部分已授权 effects 成功，原样报告实际 effects，不回滚、不扩大授权，也不得把部分落地冒充完整处置。

### 4.3 只执行已授权 effects

取得明确授权且复核无变化后，每个仍有效方向按以下顺序落地：

1. 已有 todo 或 active Task 覆盖目标时，通过 `task update --add-retrospective-source` 关联，不重复创建。
2. 没有承接 Task 且用户已同意保留意向时，通过 `task create --status todo --retrospective-source` 只写数据；不运行Git基线、不创建Environment、Change、proposal或design。
3. 多个方向可以合并到同一Task，一个源Task也可以关联多个Task；关系只到source Task ID，不绑定具体建议文本。
4. 已失效、已解决、收益不足或不适用的方向说明当前证据和丢弃理由，不创建Task。

全部已授权的有效方向完成关系写入后才处置：

- `handled`：所有有效方向均已有承接 Task，处置说明包含当前事实判断、目标 Task ID 与丢弃理由；不等于目标 Task 已实施完成。
- `no-action`：当前没有值得转化的行动；必须说明理由。
- `pending`：重新打开，清空上次处置说明与时间。

```text
<controller-command> <controller-args-prefix...> __internal task-retrospective handle --task <task-id> --target <canonical-workspace> --status <pending|handled|no-action> --note <reason> --expected-current-digest <current-digest>
```

`handled|no-action` 必须提供非空完整处理意见；`pending` 不保留说明。任一Task创建或关系写入失败时不提交最终 `handle`，保持 current disposition并报告实际 effects 与恢复动作。若digest冲突，重新inspect并基于最新报告、关系与处置状态重新判断、展示方案并取得新授权。重新record会原子重置为pending。

## 5. 报告边界

向用户返回原始复盘或不可变引用、当前有效性证据、重新拆分方向、丢弃理由、实际承接Task IDs、关系effects、operation status与current digest。todo只表示意向，后续明确启动时再走task-triage和activate。

本Skill不参与Task完成、Development handoff、Finish、cleanup或OpenSpec门禁，也不创建空复盘。
