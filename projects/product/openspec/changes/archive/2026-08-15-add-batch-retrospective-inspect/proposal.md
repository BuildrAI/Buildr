## Why

Agent 处理一组待处置复盘时，当前只能逐个启动内部 driver 并调用单 Task `inspect`，造成重复进程启动、大量中间输出和不必要的上下文占用。现有 Task query 与 Retrospective Application 已具备全部权威读取能力，适合增加一个有界、零写入的批量组合入口。

## What Changes

- 为 Task Retrospective Application 增加批量只读检查操作，复用 current Task query 和单 Task inspect，不新增存储或专业事实。
- 内部 driver 增加 `list` action，默认读取 `pending`，支持处置状态、重复 Task ID、最大返回条数和显式包含报告正文。
- 批量结果使用闭合 JSON schema，稳定返回匹配数、返回数、截断状态、每项摘要、follow-up 与逐项诊断。
- 默认省略 `reportMarkdown`；只有调用方显式请求时才返回正文。
- 不增加评分、自动分析、自动处置、Task mutation、历史记录或生命周期门禁。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-retrospectives`：增加有界批量只读检查及内部 driver 入口，同时保持单一 current authority 和处置授权边界不变。

## Impact

- 修改 Task Retrospective Application、内部 driver 与 public JSON schema registry。
- 更新随包 `task-retrospective` Skill 和 capability contract，指导 Agent 优先批量枚举、按需读取正文。
- 增加 Application、driver 和 package contract 聚焦测试。
- 不修改 SQLite schema、Task Record、Buildr Web、Task lifecycle 或外部系统。
