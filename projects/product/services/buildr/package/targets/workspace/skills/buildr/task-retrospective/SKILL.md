---
name: task-retrospective
description: 用户明确要求复盘已完成或已放弃的正式 Task，或要查看、处理、标记无需处理、重新打开已有复盘时使用；复盘重点检查 Agent 执行时间、token 消耗、重复尝试、人机协作或 Buildr workflow/harness 效率。不用于过程 observation、任务审查、门禁或资产自动写回。
---

# Task Retrospective

本 Skill 是 `buildr.task-retrospective/v2` 的默认 provider。Agent负责复盘、当前事实重评与后续承接；Retrospective Application只负责terminal校验与SQLite current Result/处置状态，Task来源关系只通过selected `buildr.task-record/v2` provider维护。

## 1. 恢复任务事实

确认 canonical Workspace 和正式 Task ID，读取 Task Record；Task 必须是 `completed` 或 `abandoned`。先通过当前 Buildr controller source root 下的内部 driver 执行 `inspect`：

```text
node <buildr-controller-source>/src/interfaces/internal/task-retrospective-driver.mjs inspect --task <task-id> --target <canonical-workspace>
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

## 3. 完整后一次写入

报告未完成或任务仍active时不写。完整报告形成后执行：

```text
node <buildr-controller-source>/src/interfaces/internal/task-retrospective-driver.mjs record --task <task-id> --target <canonical-workspace> --report-markdown <markdown>
```

Application会完整替换同一Task的current row；不创建历史、候选或draft。若命令行承载长Markdown存在转义风险，使用安全的进程参数调用方式，不借此新增临时持久化store。

## 4. 处理 current 复盘

用户要求处理已有复盘时，先 `inspect`，在对话中直接给出完整原始 `reportMarkdown`；正文过长或已在同一对话完整展示时可以给出 `currentDigest` 不可变引用，但不能只让用户去 Local App 查。随后读取当前 canonical specs、实现、knowledge 与 open Task，对原问题和建议逐项判断当前是否仍存在、仍有效，再按当前事实重新拆分改进方向；不沿用旧行动项编号，也不生成新 action item ID。

每个仍有效方向按以下顺序落地：

1. 已有 todo 或 active Task 覆盖目标时，通过 `task update --add-retrospective-source` 关联，不重复创建。
2. 没有承接 Task 且用户已同意保留意向时，通过 `task create --status todo --retrospective-source` 只写数据；不运行Git基线、不创建Environment、Change、proposal或design。
3. 多个方向可以合并到同一Task，一个源Task也可以关联多个Task；关系只到source Task ID，不绑定具体建议文本。
4. 已失效、已解决、收益不足或不适用的方向说明当前证据和丢弃理由，不创建Task。

全部有效方向完成关系写入后才处置：

- `handled`：所有有效方向均已有承接 Task，处置说明包含当前事实判断、目标 Task ID 与丢弃理由；不等于目标 Task 已实施完成。
- `no-action`：当前没有值得转化的行动；必须说明理由。
- `pending`：重新打开，清空上次处置说明与时间。

```text
node <buildr-controller-source>/src/interfaces/internal/task-retrospective-driver.mjs handle --task <task-id> --target <canonical-workspace> --status <pending|handled|no-action> --note <reason> --expected-current-digest <current-digest>
```

`handled|no-action` 必须提供非空完整处理意见；`pending` 不保留说明。任一Task创建或关系写入失败时保持pending并报告恢复动作。若digest冲突，重新inspect并基于最新报告、关系与处置状态重新判断。重新record会原子重置为pending。

## 5. 报告边界

向用户返回原始复盘或不可变引用、当前有效性证据、重新拆分方向、丢弃理由、实际承接Task IDs、关系effects、operation status与current digest。todo只表示意向，后续明确启动时再走task-triage和activate。

本Skill不参与Task完成、Development handoff、Finish、cleanup或OpenSpec门禁，也不创建空复盘。
