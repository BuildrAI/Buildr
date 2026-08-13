## ADDED Requirements

### Requirement: 平台更新必须替换完整且匹配渠道的产品单元
平台来源的 `buildr update` MUST NOT 调用 npm 或只替换 executable、payload resources、Launcher、Product Node、identity 中的子集。它 MUST 只检查或协调与当前 platform/architecture/channel 匹配、签名有效且 manifest digest 可验证的完整 installer；没有安全自动安装能力时 MUST 返回明确下载/installer next action 而非跨渠道更新。

#### Scenario: 平台存在新版本
- **WHEN** platform installation 检查到兼容且签名有效的新 installer
- **THEN** update MUST 报告当前与可用 Buildr/Product Node/payload/artifact identity，并只选择相同正式 channel
- **AND** 安装 MUST 由平台 installer 事务替换整个产品单元且保留 Workspace/Agent/user data

#### Scenario: 平台更新条件不足
- **WHEN** manifest、签名、target architecture、安装 ownership 或 installer 下载 digest 无法证明
- **THEN** update MUST fail closed 并保留当前可运行产品单元
- **AND** MUST NOT 调用 `npm install`、修改 npm prefix、development checkout 或 Workspace Node

## MODIFIED Requirements

### Requirement: Buildr CLI 自动识别更新来源
Buildr MUST 从当前进程校验后的 installation-origin identity 与 ownership receipt 识别更新来源，并将其分类为 development checkout、npm registry package、正式 platform installation 或 unknown。PATH、executable 文件名、cwd 与目录外观 MUST NOT 单独决定来源。

#### Scenario: 识别开发 checkout
- **WHEN** 当前 Buildr identity 绑定声明 package identity 的有效 Git worktree、source root 与 commit
- **THEN** Buildr MUST 将更新模式报告为开发者模式
- **AND** Buildr MUST 报告产品根、当前 branch、HEAD、upstream 与 development launcher identity

#### Scenario: 识别 registry package
- **WHEN** 当前 installation identity 来自可证明的 `@buildr-ai/buildr` npm pack staging 且不属于 development/platform channel
- **THEN** Buildr MUST 将更新模式报告为 npm registry package
- **AND** Buildr MUST 报告 package identity、当前版本、prefix、host Node 与安装位置

#### Scenario: 识别正式平台安装
- **WHEN** 当前 signed product identity 与 installer ownership receipt 证明 executable 属于正式平台产品单元
- **THEN** Buildr MUST 将更新模式报告为 platform installation
- **AND** MUST 报告 installer/channel、Product Node、platform、architecture、payload digest 与 artifact identity

#### Scenario: 来源无法证明
- **WHEN** Buildr 无法无歧义证明当前 executable 属于 development checkout、npm package 或正式 platform installation
- **THEN** Buildr update MUST NOT 修改 Git checkout、本机 package、平台产品或 Workspace runtime
- **AND** Buildr MUST 返回 Agent-readable 阻塞原因和下一步

### Requirement: Buildr update 只更新 CLI 自身
`buildr update` MUST 只更新当前可证明的 Buildr installation channel，不得同步或诊断任何 Workspace；development-checkout 的只读检查 MUST 区分 Git source 同步状态与已发布 package version 状态，npm 与 platform 模式 MUST 分别遵循 package 与完整 installer lifecycle。

#### Scenario: update 成功后退出
- **WHEN** Agent 运行 `buildr update` 且当前来源可安全更新
- **THEN** Buildr MUST 只完成当前 development、npm 或 platform channel 拥有的更新并退出
- **AND** Buildr MUST NOT 同步 Workspace assets、安装 Buildr Skill、render Agent runtime、运行 Workspace doctor 或改变 Workspace Node

#### Scenario: update 不接收 workspace target
- **WHEN** Agent 为 `buildr update` 传入 workspace `--target`
- **THEN** Buildr MUST 拒绝该参数并说明 Workspace 同步应使用 `buildr sync <agent> --target <dir>`

#### Scenario: 检查 CLI 更新
- **WHEN** Agent 运行 `buildr update check --json`
- **THEN** Buildr MUST 只读检查当前来源、可用更新和安全阻塞状态
- **AND** JSON MUST 包含 mode、current、available、status、blockingReasons 和 nextActions
- **AND** development-checkout 结果 MUST 分别包含 sourceStatus 与 versionStatus，platform 结果 MUST 包含 installer/payload/Product Node identity

#### Scenario: 开发 checkout 版本落后于已发布版本
- **WHEN** 当前 branch 与 upstream 一致，但 checkout package version 低于 npm 对应发布渠道的可用版本
- **THEN** update check MUST 报告 sourceStatus 为 `up-to-date` 且 versionStatus 为 `stale`
- **AND** 顶层 status MUST NOT 报告 `up-to-date`
- **AND** Buildr MUST NOT 因版本漂移自动安装 registry package、修改 checkout、切换 platform channel 或同步 Workspace

#### Scenario: 无法查询发布版本
- **WHEN** development-checkout 的 registry/release version 查询不可用
- **THEN** update check MUST 保留 Git source 检查结果并将 versionStatus 报告为 `unknown`
- **AND** Buildr MUST NOT 把远端查询失败解释为修改 Git checkout、npm package 或平台产品的授权

