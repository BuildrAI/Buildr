---
name: task-review
description: 审查正式任务的方案或完成结果、查看或保存对应审查结果时使用；不用于通用代码审查。
---

# Task Review

本 Skill 是 `buildr.task-review/v2` 的默认 provider。Agent 完成判断，Task Review Application 保存方案与实现结果的独立当前结论及历次完整审查。

## 1. 确认审查目标

读取 canonical Workspace 中的正式 Task，确认 `planning|completion` 类型。面向用户称实现审查（Implementation Review），兼容接口类型仍为 `completion`，不改写已有结果或历史。先执行：

```text
buildr task review inspect <task-id> --target <canonical-workspace> --json
```

再从真实工作现场取得本次对象及稳定 `subjectIdentity`：

- 方案可以来自当前 OpenSpec artifacts、任务清单、设计文档或其他专业 owner；直接使用当前对象或专业接口已返回的稳定身份。
- 完成结果可以是当前代码内容、Git commit/tree、文件产物、部署结果或外部系统结果。
- 实际对象位于独立Worktree时，使用matching Worktree evidence返回的checkout；否则核对当前Workspace、Project/Service registry与Git根。不要从cwd、分支名或旧Review Result猜测。

Review 是可选证据。Task Verification、任务收尾和 Parent 管理都不因 Result 缺失、`changes-requested` 或旧对象而自动阻塞。

分别依据当前任务说明（Task Brief）、真实方案选择、范围、风险及用户要求判断方案审查（Planning Review）和实现审查（Implementation Review），不因 `change-flow` 自动两次审查，也不因无变更（Change）、`code-only` 或 `spec-maintenance` 排除需要的审查。

- `planning` 审方案选择：核对问题、目标、边界和完成依据是否被真实方案覆盖，检查完整性、合理性、一致性、关键取舍与风险。方案可来自任务文档、设计、清单或专业产物；OpenSpec artifacts 只是来源之一。需要时在方案对象可读、取舍尚可调整时执行。
- `completion` 审实现兑现：实现对象稳定后，对照当前任务说明与适用方案核对真实成果；没有正式方案或未执行 `planning` 也可独立执行，不补造方案或假设方案已通过。

需要但未完成、材料缺失、未执行、确实不适用、发现问题与已接受分别如实说明。需要或不适用的理由记录在既有材料或工作摘要（Work Context），不新增专业状态库；专业应用只保存已形成的真实结论。记录缺失、`changes-requested` 或旧对象不形成自动门禁，但必要目标或风险尚未解决时不得报整体完成；未完成不能称不适用或已通过。

## 2. 动态审查

根据 Task Intent、当前对象、工程风险和用户要求决定阅读范围，使用现有文件、Git、测试、浏览器、外部系统或其他专业工具重新观察。正常软件开发中，例如：方案审查检查接口边界、兼容性和测试安排；完成审查检查真实代码差异、关键测试结果及用户要求是否兑现。

记录：

- `reviewed`：至少一个实际审阅的可移植对象；
- `uncovered`：相关但未审阅的对象及真实原因；
- `findings`：简洁事实，可以为空；
- `conclusion`：`accepted|changes-requested` 和非空摘要。

同一 Agent 自审使用 `self`；只有另一 Agent 完整执行才使用 `independent-agent`；只有人给出本次结论才使用 `human`。不要保存隐藏推理、session、model、完整日志或凭证。

## 3. 原子记录

完整结论形成后，用 `inspect` 返回的同类型 `resultDigest` 作为 `--expected-current`；槽位不存在时使用 `absent`：

```text
buildr task review record <task-id> --type <planning|completion> --subject-identity <identity> --method <self|independent-agent|human> --reviewed <subject> ... [--uncovered <subject>::<reason> ...] [--finding <text> ...] --outcome <accepted|changes-requested> --summary <text> --expected-current <absent|sha256-digest> --target <canonical-workspace> --json
```

同类型新结果记录成功时，应用（Application）在同一事务中保留旧完整结果；`inspect` 返回当前结果与 `history`。历史帮助理解修改过程，不自动证明当前对象已通过。

并发冲突时重新 inspect，重新核对现场后决定是否重做或替换；不得盲目重试。Agent、工具或人工流程在完整结论前中断时不要调用 record，也不要写 draft/blocked 占位。

## 4. 报告边界

报告类型、审查对象 identity、method、reviewed/uncovered、findings、结论和写入效果。Application 不判断适用性；以后使用该 Result 时，Agent 必须重新观察对象并自行判断。

本 Skill 不创建验证报告、交付记录、Parent 决定、Git 提交或通用状态机；Task Retrospective 继续独立处理执行效率与流程改进。
