## ADDED Requirements

### Requirement: runtime 命令省略位置身份时分派保持参数完整
Buildr runtime 命令（`render`、`sync`、`runtime check`、`skill install`、`skills render`、`rules render`）的位置运行时身份 MUST 可选。CLI 分派 MUST NOT 把以 `--` 开头的参数或其值读作位置身份或命令词；省略身份时该槽位 MUST 为 `null`，全部选项与值 MUST 原样到达对应操作。省略身份或仅传 `--adapter` 时，适配器（Adapter）MUST 由同一选择规则依据 Workspace 现场证据与显式 `--adapter` 决定，MUST NOT 静默落到忽略现场证据的默认适配器。

#### Scenario: 省略身份的 skills render
- **WHEN** 执行 `buildr skills render --target <dir>`
- **THEN** `--target` 值 MUST 作为 Skill source workspace 生效
- **AND** 运行时身份 MUST 为 `null`，MUST NOT 报 `Unknown argument` 或把 `--target` 记为运行时身份

#### Scenario: 显式身份不变
- **WHEN** 执行 `buildr skills render codex --target <dir>`
- **THEN** 运行时身份 MUST 保留为 `codex`，投射适配器与参数语义与既有行为一致

#### Scenario: 省略身份的 rules render 按现场选择
- **WHEN** 在存在 `claude-code` 受管证据的 workspace 执行 `buildr rules render --target <dir>`
- **THEN** MUST 按同一选择规则选择 `claude-code` 适配器并执行 rules render
- **AND** 当现场只解析出原生消费 `AGENTS.md` 的适配器且无显式选择时，MUST 以非零退出说明该适配器不执行 rules render

#### Scenario: 显式 `--adapter` 不要求位置身份
- **WHEN** 执行 `buildr rules render --adapter claude-code --target <dir>` 或 `buildr runtime check --adapter claude-code --target <dir>`
- **THEN** MUST 使用 `claude-code` 适配器执行对应操作，MUST NOT 因省略位置身份而改选默认适配器

#### Scenario: 省略身份的 sync 与 skill install
- **WHEN** 执行 `buildr sync --target <dir>` 或 `buildr skill install --target <dir>`
- **THEN** 运行时身份 MUST 为 `null`，`--target` 值 MUST 生效
- **AND** 适配器 MUST 由同一选择规则决定
