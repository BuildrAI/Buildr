## ADDED Requirements

### Requirement: Buildr CLI 必须从 receipt 识别 npm 或 development 更新来源
Buildr MUST 从当前进程校验后的 installation-origin identity 与 ownership receipt 识别更新来源，并将其分类为 development checkout、npm registry package 或 unknown。PATH、executable 文件名、cwd 与目录外观 MUST NOT 单独决定来源；当前产品 MUST NOT 生成 platform installation 更新模式。

#### Scenario: 识别开发 checkout
- **WHEN** 当前 Buildr identity 绑定声明 package identity 的有效 Git worktree、source root 与 commit
- **THEN** Buildr MUST 将更新模式报告为 development
- **AND** MUST 报告产品根、当前 branch、HEAD、upstream 与 development launcher identity

#### Scenario: 识别 registry package
- **WHEN** formal origin、payload manifest 与 installation receipt 证明当前 entry 属于 `@buildr-ai/buildr` npm installation
- **THEN** Buildr MUST 将更新模式报告为 npm registry package
- **AND** MUST 报告 package identity、当前版本、prefix、Host Node、entry、update authority 与已登记 Launcher binding

#### Scenario: 来源无法证明
- **WHEN** Buildr 无法无歧义证明当前 entry 属于 development checkout 或 npm package
- **THEN** `buildr update` MUST NOT 修改 Git checkout、npm package、Launcher 或 Workspace runtime
- **AND** MUST 返回 Agent-readable 阻塞原因和下一步

### Requirement: Buildr update 必须只更新当前 npm 或 development 安装
`buildr update` MUST 只更新当前可证明的 development 或 npm installation，不得同步或诊断任何 Workspace。npm 更新成功后 MAY 刷新已存在且 ownership identity 匹配的本机 Launcher binding，但 MUST NOT 创建新 Launcher 或形成独立更新渠道。

#### Scenario: update 成功后退出
- **WHEN** Agent 运行 `buildr update` 且当前来源可安全更新
- **THEN** Buildr MUST 只完成当前 development 或 npm installation 拥有的更新，并在适用时原子刷新已存在 Launcher binding
- **AND** MUST NOT 同步 Workspace assets、安装 Buildr Skill、render Agent runtime、运行 Workspace doctor 或改变 Workspace Node

#### Scenario: update 不接收 workspace target
- **WHEN** Agent 为 `buildr update` 传入 Workspace `--target`
- **THEN** Buildr MUST 拒绝该参数并说明 Workspace 同步应使用 `buildr sync <agent> --target <dir>`

#### Scenario: 检查 CLI 更新
- **WHEN** Agent 运行 `buildr update check --json`
- **THEN** Buildr MUST 只读检查当前来源、可用更新、update authority、Launcher binding 与安全阻塞状态
- **AND** JSON MUST 包含 mode、current、available、status、blockingReasons 和 nextActions

## MODIFIED Requirements

### Requirement: 发布模式更新 registry package
npm 发布模式 update MUST 查询当前 package 配置的 npm registry，并只使用 installation receipt 中 identity-bound 的 Host Node、npm CLI 与 prefix 更新同一 `@buildr-ai/buildr` package。成功后 MUST 原子刷新同 ownership 的已有 Launcher binding；authority 不完整时 MUST fail closed，不得从 PATH 查找 npm。

#### Scenario: registry 存在新版本
- **WHEN** registry 报告兼容新版本且当前 update authority、package root 与 prefix 均可验证
- **THEN** Buildr MUST 使用登记的 Host Node 与 npm CLI 更新承载当前 entry 的 package，并保持 registry、scope、tag 和 prefix
- **AND** 已存在 matching Launcher 时 MUST 在新 package/payload 验证通过后原子刷新 binding

#### Scenario: registry 已是最新版本
- **WHEN** registry 可达且当前版本不低于可用版本
- **THEN** Buildr MUST 报告 CLI 已是最新版本
- **AND** MUST NOT 重装 package、创建 Launcher 或同步 Workspace

#### Scenario: registry 更新受阻
- **WHEN** registry 不可达、版本不兼容、权限不足、authority 漂移或安装位置无法安全解析
- **THEN** Buildr MUST 停止且不得请求提权、切换 registry、扫描 PATH 或部分刷新 Launcher
- **AND** MUST 返回可供 Agent 解释的阻塞原因和下一步

## REMOVED Requirements

### Requirement: Buildr CLI 自动识别更新来源
**Reason**: 旧要求包含已退出当前产品的 platform source。
**Migration**: 使用新增的 receipt-bound npm/development source requirement。

#### Scenario: 移除 platform source
- **WHEN** Buildr 识别当前 update source
- **THEN** MUST 只返回 npm、development 或 unknown

### Requirement: Buildr update 只更新 CLI 自身
**Reason**: 当前更新边界需要明确限定为当前 npm 或 development installation，并允许刷新同 ownership Launcher binding。
**Migration**: 使用新增的 installation-scoped update requirement。

#### Scenario: 更新当前 installation
- **WHEN** `buildr update` 获得可验证来源
- **THEN** MUST 只更新该 npm 或 development installation

### Requirement: 平台更新必须替换完整且匹配渠道的产品单元
**Reason**: 当前正式产品只有 npm installation，不再提供 Product Node、SEA 或平台 installer 更新渠道。

**Migration**: 已存在的未发布平台候选不得通过 `buildr update` 激活；用户继续使用 npm package，未来平台渠道需由新的 OpenSpec Change 重新引入。

#### Scenario: 当前没有平台 update route
- **WHEN** Buildr 解析 current installation update mode
- **THEN** mode MUST 只允许 npm、development 或 unknown
- **AND** MUST NOT 提供 platform installer 下载、替换或 npm 跨渠道 fallback
