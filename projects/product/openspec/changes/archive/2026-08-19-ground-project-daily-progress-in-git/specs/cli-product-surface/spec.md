## MODIFIED Requirements

### Requirement: CLI 必须登记每日演进 Agent-machine 命令
Buildr CLI MUST 将 Project 每日演进的 `record`、`inspect` 与 `list` 登记为 `agent-machine` 产品表面，并 MUST 要求显式 Project。`record` MUST 接受 closed payload 或等价结构化输入，覆盖日摘要、提交列表、变更文件与可选 Task 关联；他人提交带 Task 时 MUST 失败。`inspect`/`list` MUST 只读。这些命令 MUST NOT 被描述为 primary 人类主路径，也 MUST NOT 提供定时调度或现场 Git 扫描。

#### Scenario: 根帮助列出每日演进
- **WHEN** 用户或 Agent 查看 CLI 帮助中的 Agent-machine 命令
- **THEN** 帮助 MUST 能发现每日演进 record/inspect/list
- **AND** MUST 说明它们写本机文件、可选关联本机 Task，不进入 Git 或 Task SQLite
