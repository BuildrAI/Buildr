---
name: task-review
description: 用户要求审查正式 Task 的方案或完成结果、查看已有 Task Review Result，或 Agent 判断需要留下轻量审查证据时使用；不用于资产复盘、Task Verification、统一门禁或通用代码 Review。
---

# Task Review

本 Skill 是 `buildr.task-review/v2` 的默认 provider。Agent 完成判断，Task Review Application 只保存两份可选结果。

## 1. 确认审查目标

读取 canonical Workspace 中的正式 Task，确认 `planning|completion` 类型。先执行：

```text
buildr task review inspect <task-id> --target <canonical-workspace> --json
```

再从真实工作现场取得本次对象及稳定 `subjectIdentity`：

- 方案可以来自当前 OpenSpec artifacts、任务清单、设计文档或其他专业 owner；直接使用当前对象或专业接口已返回的稳定身份。
- 完成结果可以是当前代码内容、Git commit/tree、文件产物、部署结果或外部系统结果。
- 实际对象位于 Task Environment 时，使用 `task-environment` 返回的 execution/validation root；不要从 cwd 或旧 Review Result 猜测。

Review 是可选证据。Task Verification、任务收尾和 Parent 管理都不因 Result 缺失、`changes-requested` 或旧对象而自动阻塞。

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

并发冲突时重新 inspect，重新核对现场后决定是否重做或替换；不得盲目重试。Agent、工具或人工流程在完整结论前中断时不要调用 record，也不要写 draft/blocked 占位。

## 4. 报告边界

报告类型、审查对象 identity、method、reviewed/uncovered、findings、结论和写入效果。Application 不判断适用性；以后使用该 Result 时，Agent 必须重新观察对象并自行判断。

本 Skill 不创建验证报告、交付记录、Parent 决定、Git 提交或通用状态机；Task Retrospective 继续独立处理执行效率与流程改进。
