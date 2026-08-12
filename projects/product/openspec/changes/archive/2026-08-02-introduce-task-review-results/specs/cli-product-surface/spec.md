## ADDED Requirements

### Requirement: CLI 必须提供最小 Task Review Result 管理入口
Buildr CLI MUST 公开 `buildr task review inspect <task-id>` 与 `buildr task review record <task-id>`，并 MUST 只把解析后的 canonical target、current target identity 或完整语义字段交给 Task Review Application。CLI MUST NOT 执行 Review、生成 plan/Candidate identity、接受 caller path 或写完整 next-state YAML。

#### Scenario: 查看两个 current slots
- **WHEN** 用户运行 `buildr task review inspect <task-id> --target <canonical-workspace> --json`
- **THEN** CLI MUST 返回 Planning/Completion 两个可选 slot 的 Application read model
- **AND** 未提供 current target identity 时已存在 Result 的 applicability MUST 为 unknown

#### Scenario: 记录完整 Review Result
- **WHEN** 用户运行 `buildr task review record` 并提供 type、target identity、method、reviewed、uncovered、findings、outcome 与 summary
- **THEN** CLI MUST 调用 Application record，并返回 recorded 或 blocked 的结构化结果
- **AND** CLI MUST 不接受 schemaVersion、taskId、completedAt、revision、current 或 applicability 作为 caller-authored字段

#### Scenario: 查看 Task Review help
- **WHEN** 用户运行根帮助、`buildr task --help`、`buildr task review --help` 或具体 action help
- **THEN** help MUST 说明 CLI 只管理完成 Result、两种类型均可选、record 需要明确 target identity、中断不写入且适用性由 identity 比较派生
- **AND** help MUST 不把命令描述为 Review engine、Development gate 或 Candidate generator
