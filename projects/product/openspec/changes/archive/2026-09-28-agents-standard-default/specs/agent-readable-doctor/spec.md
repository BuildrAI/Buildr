## MODIFIED Requirements

### Requirement: doctor filters runtime checks by Agent
Buildr doctor MUST 支持 Agent-readable 诊断按当前 Agent runtime 过滤 runtime checks。

#### Scenario: Supported Agent-specific doctor
- **WHEN** Agent 运行 `buildr doctor --target <root> --agent codex --json`
- **THEN** doctor MUST 对适用 scopes 运行 Codex runtime diagnostics
- **AND** doctor MUST NOT 在 top-level findings 或 nextSteps 中报告 Claude Code runtime missing、stale、warning 或 conflict findings

#### Scenario: Another supported Agent-specific doctor
- **WHEN** Agent 运行 `buildr doctor --target <root> --agent claude-code --json`
- **THEN** doctor MUST 对适用 scopes 运行 Claude Code runtime diagnostics
- **AND** doctor MUST NOT 在 top-level findings 或 nextSteps 中报告 Codex runtime missing、stale、warning 或 conflict findings

#### Scenario: Doctor reports selected Agent
- **WHEN** Agent 运行 `buildr doctor --target <root> --agent <agent> --json`
- **THEN** doctor JSON MUST 包含 requested Agent runtime id
- **AND** doctor JSON MUST 包含 实际选择的 adapterId、选择原因与请求身份；supported MUST 仅表示可准备所选文件约定，不证明品牌安装或加载
- **AND** runtime findings MUST 能归因到 selected Agent runtime

#### Scenario: Agent filter does not change scope discovery
- **WHEN** Agent 运行 `buildr doctor --target <root> --agent <agent> --json` 且不传 `--scope`
- **THEN** doctor MUST 保持现有 workspace root 和已发现 Project scopes 的 scope discovery 行为
- **AND** `--agent` MUST 只过滤 diagnostics 使用的 runtime adapter

#### Scenario: Scoped runtime repair command
- **WHEN** doctor 针对某个 Buildr scope 报告 runtime render finding
- **THEN** repair commands MUST 包含修复该 finding 所需的 scope
- **AND** Project scope finding MUST NOT 通过只 render workspace root scope 的命令修复

### Requirement: doctor handles unsupported Agent runtimes
Buildr doctor MUST 对未知但有效的运行时品牌检查标准文件，并区分文件状态与品牌行为证据。

#### Scenario: Unsupported Agent-specific doctor
- **WHEN** 调用方使用 `doctor --agent <unregistered-runtime>`
- **THEN** MUST 保留请求身份并使用 `agents-standard` 检查文件
- **AND** MUST NOT 仅因品牌未登记生成 unsupported warning 或要求联系作者
- **AND** MUST 明确安装与会话加载未确认，并继续检查源资产

#### Scenario: Unsupported Agent does not create adapter missing noise
- **WHEN** 未登记品牌使用标准诊断
- **THEN** MUST 只报告标准文件的实际状态，不为无关专用适配器（Adapter）制造缺失噪声

#### Scenario: 非法显式适配器
- **WHEN** doctor 收到不存在的 `--adapter`
- **THEN** MUST 报告参数错误而不回退标准

### Requirement: doctor validates Agent id format
Buildr doctor MUST 在 runtime adapter selection 前拒绝非法 Agent id。

#### Scenario: Invalid Agent id
- **WHEN** Agent 运行 `buildr doctor --agent "Cursor Agent" --target <root> --json`
- **THEN** doctor MUST 拒绝该参数
- **AND** error MUST 说明 Agent ids 只能包含 letters、digits、dots、underscores 或 dashes

#### Scenario: Case-sensitive unsupported Agent id
- **WHEN** Agent 运行 `buildr doctor --agent Codex --target <root> --json`
- **THEN** doctor MUST 保留 `Codex` 身份并按未知有效品牌使用标准
- **AND** doctor MUST NOT 将它归一化为 `codex`

### Requirement: doctor remains backward compatible without Agent filter
Buildr doctor MUST 保持未传 Agent runtime filter 的公开调用兼容性，但 MUST NOT 将全部 supported adapters 解释为当前 workspace 已安装或必须维护的 runtime。

#### Scenario: Doctor without Agent filter
- **WHEN** 调用方运行 `buildr doctor --target <root> --json` 且不传 `--agent`
- **THEN** doctor MUST 从 Buildr managed marker、projection receipt 或等价受管证据发现当前 workspace 的 present runtime inventory
- **AND** doctor MUST 对已有 present adapters 保持诊断；没有已有受管接入时 MUST 使用标准默认诊断，且不推断宿主品牌
- **AND** doctor JSON MUST 报告实际 `detectedAgents` 和 `checkedAgents`
- **AND** Buildr onboarding guidance MUST 在 Agent identity 已知后优先传入 `--agent <agent>`

#### Scenario: Supported adapter 在 workspace 中不存在
- **WHEN** 一个非默认 adapter 位于 supported registry，但 workspace 没有该 adapter 的受管投射证据且未被显式选择
- **THEN** 默认 doctor MUST NOT 对该 adapter 运行 checker
- **AND** MUST NOT 为该 adapter 生成 missing、stale、warning、repair plan 或 nextSteps

#### Scenario: Present runtime 未被选为当前 Agent
- **WHEN** 默认 doctor 发现一个 present runtime 的投射 drift，但调用方没有显式选择该 adapter
- **THEN** doctor MAY 在 runtime inventory 中保留该 drift evidence
- **AND** 顶层聚合 finding MUST 设置 `userActionRequired: false`
- **AND** 该 drift MUST NOT 单独降低通用 workspace `health.ready`
