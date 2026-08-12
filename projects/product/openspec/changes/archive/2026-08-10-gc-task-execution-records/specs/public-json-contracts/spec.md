## ADDED Requirements

### Requirement: ExecRecord GC CLI 必须提供稳定公共 JSON
Buildr MUST 提供 `buildr task execution-record gc [--target <canonical-workspace>] [--dry-run] [--limit <1..500>] [--json]`。`--json` MUST使用登记的 ExecRecord GC schema，并 MUST直接投射同一次 Application result；CLI MUST NOT接受 Task/owner/path、retention override、force、failure disposition 或 cleanup shell 输入。

#### Scenario: headless dry-run
- **WHEN** automation 使用 `--dry-run --json` 调用 ExecRecord GC
- **THEN** CLI MUST返回 machine-readable stable schema、Workspace 级 counts 与 bounded selected actions
- **AND** MUST不执行 mutation或输出正文 locator、本机绝对路径和 SQLite 细节

#### Scenario: 手动执行 bounded GC
- **WHEN** caller 使用合法 limit 调用非 dry-run CLI
- **THEN** CLI MUST调用 Task Execution Record Application 完成同一 bounded GC operation
- **AND** 非 JSON 输出 MUST只给出简洁计数摘要，不改变 Application authority

#### Scenario: 非法策略输入
- **WHEN** caller 提供越界 limit、force、owner、path 或 retention override
- **THEN** CLI MUST在 GC mutation 前拒绝请求并返回稳定 input diagnostic
- **AND** MUST NOT创建第二策略或绕过固定 retention
