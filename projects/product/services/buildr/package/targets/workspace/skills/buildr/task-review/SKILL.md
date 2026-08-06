---
name: task-review
description: 用户要求审查正式 Task 的计划或完成候选、查看已有 Task Review Result，或实现任务在计划/完成节点需要形成轻量审查 evidence 时使用；不用于资产沉淀复盘、Task Verification 或通用代码 Review。
---

# Task Review Skill

本 Skill 是 `buildr.task-review/v1` 的默认 provider。它用一个参数化能力完成 Planning Review 或 Completion Review；语义审查由 Agent/人完成，确定性 Task Review Application 独占 Result 写入和读取。

## 1. 确认目标

先确认 canonical Workspace、正式 Task ID、`planning|completion` 类型和该类型的 current target identity，再运行：

```text
buildr task review inspect <task-id> [--planning-target <identity>] [--completion-target <identity>] --target <canonical-workspace> --json
```

读取 Task Record 的 Intent、scope 与限定 Change 引用。实际执行目标位于 Task Environment 时，使用 `task-environment` 返回的 execution/validation root 读取，不从 cwd 或 Review Result 猜环境 authority。

- `planning` 绑定当前计划上下文的明确稳定 identity。计划可以是 OpenSpec Change、任务清单或其他 owner 已界定的计划，不要求固定形态。
- `completion` 只绑定上游已形成的 current Candidate identity。没有明确 Candidate identity 就停止，不得用 HEAD、dirty tree、Environment identity、时间或任意临时摘要代替。

Result 存在但未提供 current target 时 applicability 是 `unknown`；identity 不同是 `stale`。两者都不能描述为仍满足审查。

## 2. 动态执行语义审查

根据 Task Intent、Project authority、目标内容、风险和用户要求选择实际 reviewed 对象。不要把 OpenSpec artifacts、代码目录、测试命令或 checklist 固定为每个 Task 的必选范围。

同时维护：

- `reviewed`：至少一个实际完成审阅的可移植逻辑对象；
- `uncovered`：相关但没有审阅的对象及真实原因，可以为空；
- `findings`：简洁事实列表，可以为空；
- `conclusion`：完整的 `ready|changes-required` 与非空摘要。

method 必须真实：同一 Agent 自审使用 `self`；只有实际独立 Agent 完整执行才使用 `independent-agent`；只有人类给出本次结论才使用 `human`。不要保存 reviewer、Agent session、model、隐藏推理、完整日志或凭证。

## 3. 只记录完整 Result

只有目标 identity 和完整结论都已形成时，调用：

```text
buildr task review record <task-id> --type <planning|completion> --target-identity <identity> --method <self|independent-agent|human> --reviewed <subject> ... [--uncovered <subject>::<reason> ...] [--finding <text> ...] --outcome <ready|changes-required> --summary <text> --target <canonical-workspace> --json
```

只传语义字段；不直接编辑旧YAML或打开SQLite，不传 schemaVersion、taskId、completedAt、revision、current、applicability、path 或完整 next state。Application 只事务替换精确类型的 current slot；Planning 和 Completion 同时存在时不生成总 receipt，也不让一种覆盖另一种。

Agent、工具或人工流程在形成完整结论前中断时不要调用 record。已有 Result 即使 stale 也保留；不得写 draft/blocked 占位结果。

## 4. 报告与边界

报告 reviewType、target identity、method、实际 reviewed/uncovered、findings、结论，以及 operation status、resultDigest、applicability、effects/diagnostic。`changes-required` 只表达审查结论，不修改 Task 顶层状态。

本 Skill 不创建 Task Environment、Task Development、Candidate generation、Verification evidence、Task Retrospective、Task Finish run、Git 提交或通用状态机。后续 gate 只由 Task Development 通过本 Application read model 判断；Task Review 本身不设置 gate。
