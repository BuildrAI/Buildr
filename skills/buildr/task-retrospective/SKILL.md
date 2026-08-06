---
name: task-retrospective
description: 用户明确要求复盘已完成或已放弃的正式 Task，重点检查 Agent 执行时间、token 消耗、重复尝试、人机协作或 Buildr workflow/harness 效率，并把一份当前报告写入 SQLite 时使用；不用于过程 observation、任务审查、门禁或资产自动写回。
---

# Task Retrospective

本 Skill 是 `buildr.task-retrospective/v1` 的默认 provider。Agent负责复盘判断；Task Retrospective Application只负责terminal校验与SQLite current Result读写。

## 1. 恢复任务事实

确认 canonical Workspace 和正式 Task ID，读取 Task Record；Task 必须是 `completed` 或 `abandoned`。先通过当前 Buildr controller source root 下的内部 driver 执行 `inspect`：

```text
node <buildr-controller-source>/src/interfaces/internal/task-retrospective-driver.mjs inspect --task <task-id> --target <canonical-workspace>
```

已有Result可以重做并完整替换；没有Result只是“尚未复盘”。不要打开SQLite；不读取、迁移或删除`.buildr/asset-review/`。

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

## 4. 报告边界

向用户返回主要高成本点、优化方向、数据缺口，以及operation status、resultDigest与effects。优化建议不自动修改Rule、Skill、workflow或产品；用户采纳后按正常Task流程另行实现。

本Skill不参与Task完成、Development handoff、Finish、cleanup或OpenSpec门禁，也不创建空复盘。
