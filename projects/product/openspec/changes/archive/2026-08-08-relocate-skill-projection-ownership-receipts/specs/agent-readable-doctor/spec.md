## ADDED Requirements

### Requirement: Doctor 从 canonical ownership receipt 发现 Agent runtime
Buildr Doctor MUST 从 `.buildr/agent-runtime/<destination>/<adapter>/skill-projection-ownership-receipts/` 发现和诊断当前 Workspace 的受管 Skill runtime，并 MUST 把旧 runtime-root receipt 仅作为迁移诊断输入。

#### Scenario: 未指定 Agent 时发现 canonical runtime
- **WHEN** Doctor 未传 `--agent` 且某 adapter 的 canonical workspace receipt root 含有效回执
- **THEN** Doctor MUST 将该 adapter 纳入 `detectedAgents` 和 `checkedAgents`
- **AND** MUST 使用 canonical receipt 诊断 runtime Skill 文件

#### Scenario: 只发现 legacy runtime receipt
- **WHEN** canonical receipt root 为空但旧 adapter runtime root 含有效 receipt
- **THEN** Doctor MUST 识别该 adapter 并报告需要运行适用 sync、render 或 Skill install 完成迁移
- **AND** Doctor MUST 保持只读且不得把 legacy 状态报告为 canonical healthy

#### Scenario: Canonical 与 legacy receipt 冲突
- **WHEN** Doctor 发现同一 adapter/runtime path 的 canonical 与 legacy receipt 不等价
- **THEN** Doctor MUST 报告 actionable ownership conflict
- **AND** repair plan MUST 要求保留现场并核对两份 identity，不能建议直接删除任一侧
