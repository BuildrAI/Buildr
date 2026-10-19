## MODIFIED Requirements

### Requirement: Buildr update 必须只更新当前 npm 或 development 安装

`buildr update` MUST 只更新当前可证明的 development 或 npm installation，不得同步或诊断任何 Workspace。npm 更新 MUST 支持 `--track stable|candidate` 显式选择 Release Track，并只安装该轨道本次刷新得到的精确版本；无参数兼容行为 MUST 对 prerelease 当前版本选择 candidate、对稳定当前版本选择 stable。npm 更新成功后 MAY 刷新已存在且 ownership identity 匹配的本机 Launcher binding，但 MUST NOT 创建新 Launcher、自动切换轨道、自动降级或形成独立更新渠道。development 更新继续只操作 Git checkout并 MUST拒绝`--track`。npm 更新成功后 MUST 自动核对同一安装槽位（Installation Slot）中正在运行的 Buildr Web，并自动完成可验证的旧版交接，不要求用户手动打开启动器（Launcher）。交接 MUST 由新版独立进程使用既有认证退出完成，MUST NOT 强杀旧实例。没有运行实例时 MUST NOT 额外启动网页；其他安装、开发版或归属不明实例 MUST 保留。结果 MUST 区分安装更新与网页切换，未确认新版健康就绪时 MUST NOT 报告切换成功。

#### Scenario: update 成功后退出

- **WHEN** Agent 运行 `buildr update --track stable|candidate` 且当前 npm 来源和所选轨道可安全更新
- **THEN** Buildr MUST 完成当前 npm installation 拥有的精确版本更新，并在适用时原子刷新已存在 Launcher binding 和自动交接同槽位旧网页实例
- **AND** MUST NOT 同步 Workspace assets、安装 Buildr Skill、render Agent runtime或运行 Workspace doctor

#### Scenario: 更新成功后旧实例仍在运行

- **WHEN** npm 更新成功，且 `installation status` 将同一安装槽位的旧版本实例报告为 `stale`
- **THEN** Buildr MUST 自动使用更新后的同一安装入口执行认证退出、启动新版和健康核验，无需用户再次打开 Launcher
- **AND** 旧版由 CLI 启动或没有安装 Launcher 时也 MUST 支持同槽位交接，不得为交接安装 Launcher
- **AND** MUST NOT 强杀实例或伪造已重启结论

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

#### Scenario: 无运行实例

- **WHEN** npm 更新成功且同槽位没有运行中的网页实例
- **THEN** Buildr MUST 保留网页未运行状态，不额外启动网页或打开浏览器

#### Scenario: 软件包更新成功但网页交接失败

- **WHEN** 安装已更新，但实例归属不符、认证退出被拒绝、旧实例退出超时、新版启动失败或新健康状态无法确认
- **THEN** 结果 MUST 保留安装成功事实，并说明网页交接未完成的原因及恢复动作
- **AND** MUST NOT 回滚软件包、强杀进程或把旧实例报告为新版

#### Scenario: 已更新的软件包继续完成遗留交接

- **WHEN** 当前 npm 软件包已是所选轨道版本，但同槽位旧版网页仍在运行
- **THEN** Buildr MUST 不重装软件包而自动重试适用交接
- **AND** 已运行当前版本时 MUST 复用，不重复重启

#### Scenario: 更新调用方随旧服务结束

- **WHEN** 更新调用方位于将退出的旧网页进程内
- **THEN** 新版交接 MUST 能由独立进程继续，不依赖旧网页进程存活
- **AND** 未收到新版就绪证明的调用方 MUST 只说明交接已发起，不伪造成功
