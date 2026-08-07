## MODIFIED Requirements

### Requirement: 新增 adapters 的 checker 报告环境与前置条件事实
Buildr MUST 让每个新增 adapter 的 `runtime-check` 区分投射状态、安装/版本 probe 状态和 activation guidance，并且只执行随产品静态声明的有限时 probe；probe MUST 与目标平台适配。没有稳定、安全、跨安装形态的自动 probe 时，descriptor MUST 使用 `manual` probe 并给出确认 guidance。

#### Scenario: Environment probe 可自动执行
- **WHEN** descriptor 声明静态 command installation 或 version probe
- **THEN** runtime check MUST 使用静态 executable 和 arguments 在有限超时内执行
- **AND** 输出 MUST 包含 probe 状态与可审计 evidence

#### Scenario: Environment 只能人工确认
- **WHEN** 目标 surface 没有稳定、安全、跨安装形态的 command probe
- **THEN** descriptor MUST 使用 `manual` probe 并给出确认 guidance
- **AND** runtime check MUST NOT 把该项报告为自动检查成功

#### Scenario: 文件系统无法证明 Agent 已加载投射
- **WHEN** Buildr 只能证明 Rules 或 Skills 投射存在，无法从文件系统证明目标 Agent 已在会话中加载
- **THEN** runtime list、runtime check 或权威文档 MUST 提供对应 activation guidance
- **AND** runtime check MUST NOT 仅因没有真实 Agent marker smoke 而生成当前用户必须处理的 prerequisite warning

#### Scenario: macOS desktop probe 仅在 macOS 执行
- **WHEN** TRAE Work 或 WorkBuddy descriptor 在 `darwin` 平台执行 runtime check
- **THEN** installation/version probe MAY 使用静态声明的 macOS `defaults` executable 和参数
- **AND** 输出 MUST 包含 probe 状态与可审计 evidence

#### Scenario: 非 macOS desktop probe 使用人工确认
- **WHEN** TRAE Work 或 WorkBuddy descriptor 在 Windows 或 Linux 平台执行 runtime check
- **THEN** descriptor MUST 使用 `manual` installation/version probe 和确认应用版本或安装位置的 guidance
- **AND** runtime check MUST 返回 `manual` 状态
- **AND** MUST NOT 将 macOS `defaults` 的 ENOENT 或其他平台不适用错误报告为 installation missing、version unavailable 或 `userActionRequired` prerequisite warning

#### Scenario: 其他自动 probe 仍保持安全边界
- **WHEN** descriptor 声明 command installation 或 version probe
- **THEN** runtime check MUST 使用静态 executable 和 arguments，在有限超时内执行
- **AND** 除 Windows `.cmd`/`.bat` shim 所需的平台启动适配外 MUST 不经过任意 shell command 字符串
- **AND** 输出 MUST 包含 probe 状态与可审计 evidence
