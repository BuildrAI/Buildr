## MODIFIED Requirements

### Requirement: Task Finish canonical CLI 必须只有 run 与 inspect
Buildr CLI MUST 只提供 `task finish run` 和 `task finish inspect`：`run` 从 receipt-bound task environment、Project 与可选 Change context 解析执行所需 identity 并连续执行五阶段，`inspect` 只读返回当前 run 状态。首次 run MUST 要求 `--project`，MUST 在提供 `--change` 时创建 Change 候选，并 MUST 在省略 `--change` 时创建 code-only 候选。当前客户端 MUST NOT 注册、加载或执行 `actions|advance|resume|renew|recover|cleanup-prepare|cleanup-finalize`，也 MUST NOT 接受调用方提供的 evidence/fingerprint/execution-plan/recovery 参数。

#### Scenario: 查询 canonical Task Finish 帮助
- **WHEN** 用户运行 `buildr help task finish`、`buildr task finish run --help` 或 `buildr task finish inspect --help`
- **THEN** 输出 MUST 只把 run/inspect 表述为 canonical actions，并说明 task identity 来自 environment receipt、`--project` 必需、`--change` 只对 Change 候选必需，以及可选 agent/target/resume token
- **AND** MUST NOT 要求调用方理解 step、attempt、lease、action registry 或 recovery manifest

#### Scenario: 省略 Change 创建 code-only run
- **WHEN** 调用方从 receipt-bound task environment 使用 `task finish run --project <code>`
- **THEN** CLI MUST 接受输入并把 candidate kind 解析为 code-only
- **AND** MUST NOT 返回 `missing_parameter` 或推断任意 active Change

#### Scenario: 调用旧 action
- **WHEN** 调用方使用旧 maintenance action
- **THEN** CLI MUST 作为不存在或不支持的 action 拒绝
- **AND** MUST NOT 加载旧 reader/executor 或创建旧 run

#### Scenario: Canonical store 中存在旧 run shape
- **WHEN** 当前客户端运行或检查 Task Finish 且 canonical store 中仍有旧 checkpoint、lease 或 completion shape
- **THEN** 自动选择 MUST 跳过旧 shape，显式 inspect MUST fail closed
- **AND** MUST NOT 加载旧 reader、生成迁移 receipt 或把旧 passed evidence 映射为新 phase
