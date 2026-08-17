## ADDED Requirements

### Requirement: 准备 Environment 时必须写出当前宿主
`task-environment` Skill与正式执行入口在调用`buildr task environment prepare`时 MUST提供当前宿主的`--agent <adapter>`。Agent MUST把该值写成正在执行本次prepare的runtime id，例如Cursor会话写`cursor`、Codex会话写`codex`。Skill示例、帮助摘录与停止条件 MUST NOT展示可省略`--agent`的prepare命令，也 MUST NOT指示省略后默认为Codex。Buildr MUST NOT要求Agent探测宿主；写错宿主时仍按Task Environment既有mismatch失败。

#### Scenario: Cursor Agent 准备环境
- **WHEN** 当前会话宿主为Cursor，且Agent为active Task运行prepare
- **THEN** 调用 MUST包含`--agent cursor`
- **AND** MUST NOT省略`--agent`或改写为`codex`

#### Scenario: Codex Agent 准备环境
- **WHEN** 当前会话宿主为Codex，且Agent为active Task运行prepare
- **THEN** 调用 MUST包含`--agent codex`

#### Scenario: Skill 示例要求 --agent
- **WHEN** Agent阅读`task-environment` Skill的prepare用法
- **THEN** 示例 MUST包含必填`--agent <adapter>`
- **AND** MUST NOT给出省略`--agent`即可成功的prepare命令
