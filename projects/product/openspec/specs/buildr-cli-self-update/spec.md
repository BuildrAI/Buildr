# buildr-cli-self-update Specification

## Purpose

定义 Buildr CLI 如何识别开发 checkout 或 registry package 来源，并在不隐式维护 workspace、不覆盖本地修改和不改变 package identity 的前提下安全检查或更新自身。
## Requirements

### Requirement: Buildr CLI 自动识别更新来源
Buildr MUST 从当前 executable 的真实产品根识别 CLI 更新来源，并将其分类为开发 Git checkout、registry package 或 unknown。

#### Scenario: 识别开发 checkout
- **WHEN** 当前 `buildr` executable 可解析到声明 Buildr package identity 的有效 Git worktree
- **THEN** Buildr MUST 将更新模式报告为开发者模式
- **AND** Buildr MUST 报告产品根、当前 branch、HEAD 和 upstream 状态

#### Scenario: 识别 registry package
- **WHEN** 当前 `buildr` executable 来自可证明的 npm registry package 安装布局且不属于开发 Git worktree
- **THEN** Buildr MUST 将更新模式报告为发布模式
- **AND** Buildr MUST 报告 package identity、当前版本和安装位置

#### Scenario: 来源无法证明
- **WHEN** Buildr 无法无歧义证明当前 executable 属于开发 checkout 或支持的 registry package
- **THEN** Buildr update MUST NOT 修改 Git checkout 或本机 package
- **AND** Buildr MUST 返回 Agent-readable 阻塞原因和下一步

### Requirement: Buildr update 只更新 CLI 自身
`buildr update` MUST 只更新当前 Buildr CLI 来源，不得同步或诊断任何 workspace；development-checkout 的只读检查 MUST 区分 Git source 同步状态与已发布 package version 状态。

#### Scenario: update 成功后退出
- **WHEN** Agent 运行 `buildr update` 且当前来源可安全更新
- **THEN** Buildr MUST 完成当前 CLI 来源更新并退出
- **AND** Buildr MUST NOT 同步 workspace assets、安装 Buildr Skill、render Agent runtime 或运行 workspace doctor

#### Scenario: update 不接收 workspace target
- **WHEN** Agent 为 `buildr update` 传入 workspace `--target`
- **THEN** Buildr MUST 拒绝该参数并说明 workspace 同步应使用 `buildr sync <agent> --target <dir>`

#### Scenario: 检查 CLI 更新
- **WHEN** Agent 运行 `buildr update check --json`
- **THEN** Buildr MUST 只读检查当前来源、可用更新和安全阻塞状态
- **AND** JSON MUST 包含 mode、current、available、status、blockingReasons 和 nextActions
- **AND** development-checkout 结果 MUST 分别包含 sourceStatus 与 versionStatus

#### Scenario: 开发 checkout 版本落后于已发布版本
- **WHEN** 当前 branch 与 upstream 一致，但 checkout package version 低于 npm 对应发布渠道的可用版本
- **THEN** update check MUST 报告 sourceStatus 为 `up-to-date` 且 versionStatus 为 `stale`
- **AND** 顶层 status MUST NOT 报告 `up-to-date`
- **AND** Buildr MUST NOT 因版本漂移自动安装 registry package、修改 checkout 或同步 workspace

#### Scenario: 无法查询发布版本
- **WHEN** development-checkout 的 registry version 查询不可用
- **THEN** update check MUST 保留 Git source 检查结果并将 versionStatus 报告为 `unknown`
- **AND** Buildr MUST NOT 把 registry 查询失败解释为修改 Git checkout 的授权

### Requirement: 开发者模式安全更新 Git checkout
开发者模式 update MUST 只在能够证明不会覆盖工作区修改或改写已发布提交时自动推进。

#### Scenario: 自动 fast-forward
- **WHEN** checkout clean、branch 有 upstream 且 HEAD 是 upstream 的祖先
- **THEN** Buildr MUST 自动 fast-forward 当前 branch

#### Scenario: 自动 rebase 本地未发布提交
- **WHEN** checkout clean、branch 与 upstream 分叉且当前分支提交可证明只存在于本地
- **THEN** Buildr MAY 自动将本地提交 rebase 到最新 upstream
- **AND** Buildr MUST NOT push 或 force push

#### Scenario: Git 决策点停止
- **WHEN** checkout dirty、detached、缺少 upstream、包含无法证明未发布的分叉提交、存在共享风险或 rebase 冲突
- **THEN** Buildr MUST 停止自动更新
- **AND** Buildr MUST 保留用户数据并报告 Git 状态与需要用户决定的下一步

### Requirement: 发布模式更新 registry package
发布模式 update MUST 查询当前 package 配置的 npm registry，并只更新同一 `@buildr-ai/buildr` package identity。

#### Scenario: registry 存在新版本
- **WHEN** registry 报告兼容的新版本且当前安装位置可安全更新
- **THEN** Buildr MUST 使用 npm 更新承载当前 executable 的 `@buildr-ai/buildr` package
- **AND** Buildr MUST NOT 改变 registry、scope、tag 或安装 prefix

#### Scenario: registry 已是最新版本
- **WHEN** registry 可达且当前版本不低于可用版本
- **THEN** Buildr MUST 报告 CLI 已是最新版本
- **AND** Buildr MUST NOT 重装 package 或同步 workspace

#### Scenario: registry 更新受阻
- **WHEN** registry 不可达、版本不兼容、权限不足或安装位置无法安全解析
- **THEN** Buildr MUST 停止且不得请求提权或切换 registry
- **AND** Buildr MUST 返回可供 Agent 解释的阻塞原因和下一步

### Requirement: 自举 CLI 刷新必须使用已验证 runtime identity
Buildr 自举任务在集成后刷新默认开发 CLI 时 MUST 使用 retained convergence 提供且满足产品最低版本的 Node executable，并 MUST 把 executable、版本、CLI source、安装目标和 post-install doctor 记录为 runtime-install evidence。Shell 初始化文件和 PATH 顺序 MUST NOT 成为已有 receipt-bound runtime 的 authority。

#### Scenario: Retained runtime 可用
- **WHEN** retained checkout 的 runtime identity 指向受支持 Node 和当前 CLI source
- **THEN** 安装 provider MUST 使用该 Node 执行安装预检、入口刷新、help probe 和 doctor
- **AND** 默认 CLI 链接 MUST 指向 retained Product checkout 的 canonical entry

#### Scenario: Retained runtime 不满足最低版本
- **WHEN** retained Node 版本低于 Buildr 最低要求或 executable 不可执行
- **THEN** 安装 provider MUST 在写入口前阻塞并返回稳定 runtime diagnostic
- **AND** MUST NOT 从 login shell PATH 随机选择另一个 Node 后继续
