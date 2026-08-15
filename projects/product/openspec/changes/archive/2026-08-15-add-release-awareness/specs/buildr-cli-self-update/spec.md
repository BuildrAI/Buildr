## MODIFIED Requirements

### Requirement: Buildr update 必须只更新当前 npm 或 development 安装
`buildr update` MUST 只更新当前可证明的 development 或 npm installation，不得同步或诊断任何 Workspace。npm 更新 MUST 支持 `--track stable|candidate` 显式选择 Release Track，并只安装该轨道本次刷新得到的精确版本；无参数兼容行为 MUST 对 prerelease 当前版本选择 candidate、对稳定当前版本选择 stable。npm 更新成功后 MAY 刷新已存在且 ownership identity 匹配的本机 Launcher binding，但 MUST NOT 创建新 Launcher、自动切换轨道、自动降级或形成独立更新渠道。development 更新继续只操作 Git checkout并 MUST拒绝`--track`。

#### Scenario: update 成功后退出
- **WHEN** Agent 运行 `buildr update --track stable|candidate` 且当前 npm 来源和所选轨道可安全更新
- **THEN** Buildr MUST 只完成当前 npm installation 拥有的精确版本更新，并在适用时原子刷新已存在 Launcher binding
- **AND** MUST NOT 同步 Workspace assets、安装 Buildr Skill、render Agent runtime、运行 Workspace doctor 或改变 Workspace Node

#### Scenario: 无参数兼容更新
- **WHEN** Agent 对 prerelease 当前版本运行无参数 `buildr update`
- **THEN** Buildr MUST只选择 candidate 轨道
- **AND** 稳定当前版本运行相同命令时 MUST只选择 stable 轨道

#### Scenario: development update 拒绝 release track
- **WHEN** development checkout 入口运行 `buildr update --track stable|candidate`
- **THEN** Buildr MUST拒绝该参数并说明 release track 只适用于 npm installation

#### Scenario: update 不接收 workspace target
- **WHEN** Agent 为 `buildr update` 传入 Workspace `--target`
- **THEN** Buildr MUST 拒绝该参数并说明 Workspace 同步应使用 `buildr sync <agent> --target <dir>`

#### Scenario: 检查 CLI 更新
- **WHEN** Agent 运行 `buildr update check --json`
- **THEN** Buildr MUST 强制刷新并只读检查当前来源、stable/candidate 两个轨道、update authority、Launcher binding 与安全阻塞状态
- **AND** JSON MUST 使用 `buildr.update-check/v2` 并包含 current、selectedTrack、tracks、notices、observedAt、freshness、blockingReasons 和 nextActions
