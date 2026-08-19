## MODIFIED Requirements

### Requirement: 正式收尾前必须轻量确认贡献与主工作区对齐

Task Finish Skill MUST 在调用产品 `task finish run` 之前，向用户或当前事实确认三件事：任务分支上的任务贡献已经提交；本机主工作区（retained Workspace）已经对齐本次交付的目标远端；Finish `--agent` 省略或精确等于 Environment 已绑定 adapter。该提醒 MUST NOT 替代产品入口一次聚合 Environment / Development / 交付缺口，也 MUST NOT 替代产品 preflight 的 retained/远端对齐观察。Skill MUST 仍直接启动 canonical `task finish run`，并在返回 `task_finish.entry_gaps` 时按三个模块完整转述。

#### Scenario: 收尾前发现贡献未提交或主工作区落后

- **WHEN** 用户要求正式收尾，且任务分支仍有未提交贡献，或本机主工作区落后目标远端
- **THEN** Skill MUST 先说明这两项风险，并在用户确认处理或明确继续之前停止调用产品收尾
- **AND** MUST NOT 把该提醒实现为新的 `task_finish.entry_gaps` 缺口码

#### Scenario: 已对齐后仍走产品聚合入口

- **WHEN** 贡献已提交且主工作区已对齐目标远端，用户要求正式收尾
- **THEN** Skill MUST 直接调用 canonical `task finish run`
- **AND** MUST NOT 在调用产品前自行链式做 Environment → handoff → target/remote 的 fail-fast

#### Scenario: Finish --agent 跟随 Environment

- **WHEN** Environment Receipt 的 adapter 为 `codex`，当前聊天宿主为 Cursor
- **THEN** Skill 调用 `task finish run` 时 MUST省略 `--agent` 或显式传入 `--agent codex`
- **AND** MUST NOT传入 `--agent cursor`

## ADDED Requirements

### Requirement: Task Finish 不得用会话宿主覆盖 Environment adapter
Task Finish Skill 的 `--agent` 只表达 Environment 已登记宿主，不表达当前对话 runtime。Skill 示例与停止条件 MUST允许省略 Finish `--agent`，并说明产品将使用 Environment adapter。Skill MUST NOT要求 Agent 探测宿主，也 MUST NOT把 prepare 的必填 `--agent` 规则复制到 Finish。

#### Scenario: Skill 示例允许省略 Finish --agent
- **WHEN** Agent 阅读 `task-finish` Skill 的 `task finish run` 用法
- **THEN** 示例 MUST展示可省略 `--agent` 的命令，或明确传入 Environment adapter
- **AND** MUST NOT把当前聊天宿主写成 Finish `--agent` 的默认值
