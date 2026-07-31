## ADDED Requirements

### Requirement: Workflow internal 命令必须提供完整主题帮助
Buildr CLI MUST 为 Task Finish 全部 action 以及 worktree inspect/cleanup 提供 canonical 主题帮助，并 MUST 在解析业务必需参数前处理 `--help`、`-h` 和 `help <command...>`。帮助 MUST 明确每个 action 的必需参数、互斥参数、execution surface 和安全副作用。

#### Scenario: 查询 Task Finish action 帮助
- **WHEN** 用户运行 `buildr task finish advance --help` 或 `buildr help task finish advance`
- **THEN** CLI MUST 输出同一 canonical usage 并以 0 退出
- **AND** MUST NOT 先要求 `--run`、读取 checkpoint 或修改 Workspace

#### Scenario: 查询 worktree inspect 与 cleanup 帮助
- **WHEN** 用户分别查询 `worktree inspect` 和 `worktree cleanup` 帮助
- **THEN** 输出 MUST 明确 task id、`--agent`、`--integrated-ref` 和 `--target` 在各命令中的适用性
- **AND** 不适用参数 MUST 被明确省略或标注，而不是要求调用方从错误诊断猜测

### Requirement: Workflow diagnostic 必须返回可直接执行的下一动作
Task Finish 和 worktree lifecycle 的未知 action、缺失参数及不适用参数诊断 MUST 返回稳定错误代码、canonical command suggestion 和对应 help topic。建议 MUST 使用真实支持的参数形式。

#### Scenario: 使用不存在的 Task Finish action
- **WHEN** 用户运行 `buildr task finish status`
- **THEN** CLI MUST 建议 `buildr task finish inspect --run <id>` 和对应 help topic
- **AND** MUST NOT 只返回无参数上下文的相近 action 名称

#### Scenario: Inspect 携带 cleanup 专属参数
- **WHEN** 用户为 `worktree inspect` 传入 `--agent`
- **THEN** CLI MUST 指明该参数仅适用于 create/cleanup 或给出正确 inspect usage
- **AND** 诊断 MUST 保持零 Workspace 副作用
