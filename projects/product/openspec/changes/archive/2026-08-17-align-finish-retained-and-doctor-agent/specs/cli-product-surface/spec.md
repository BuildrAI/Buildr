## ADDED Requirements

### Requirement: Task Finish run 的 --agent 必须匹配 Environment adapter
`task finish run` 的 `--agent` MUST保持可选。省略时 CLI MUST不补写 Codex 或其他默认宿主，并把缺省交给 Application 使用 Environment adapter。传入值与 Environment adapter 不一致时 MUST在创建 run 前失败。帮助 MUST说明 `--agent` 跟随 Task Environment，不得写成当前聊天宿主。

#### Scenario: 查询 Finish run 帮助中的 --agent
- **WHEN** 用户运行 `buildr help task finish run`
- **THEN** 帮助 MUST把 `--agent` 写成可选，并说明省略时使用 Environment adapter
- **AND** MUST NOT声称 Finish `--agent` 必填或默认为 Codex

#### Scenario: 省略 Finish --agent 进入 Application
- **WHEN** 调用方运行 `task finish run --task <id>` 且未提供 `--agent`
- **THEN** CLI MUST把未指定 agent 交给 Application
- **AND** MUST NOT在 CLI 层改写为 `codex` 或当前进程猜测的宿主
