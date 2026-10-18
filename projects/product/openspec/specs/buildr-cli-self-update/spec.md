# buildr-cli-self-update Specification

## Purpose

定义 Buildr CLI 如何识别开发 checkout 或 registry package 来源，并在不隐式维护 workspace、不覆盖本地修改和不改变 package identity 的前提下安全检查或更新自身。

## Requirements

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

### Requirement: 自举 CLI 刷新必须使用已验证 runtime identity
Buildr 自举激活 MUST 通过唯一 `buildr-self-bootstrap-sync` 执行器，用明确且受支持的 retained Node 验证本次已交付保留检出目录（Retained Checkout）的 `projects/product/buildr` 开发入口、适用的开发启动器（Launcher）及最终工作空间（Workspace）诊断。PATH 中默认 `buildr` MUST 保持 npm 安装的归属；开发检出目录 MUST NOT 创建、覆盖或要求默认入口绑定源码。激活 MUST 依据真实基线、交付提交、分支和远端，不依赖已退役的 Finish run 或环境回执。

#### Scenario: Retained runtime 可用
- **WHEN** 已交付检出目录与受支持 Node 的身份可验证
- **THEN** 唯一执行器 MUST 显式调用该检出目录的开发入口并核验同一 Node 和源身份
- **AND** MUST 保持默认 npm CLI 不变，并以最终 Doctor ready 证明本次激活成功

#### Scenario: 既有 managed 入口迁移
- **WHEN** 本机存在属于旧开发安装的入口或其他归属的默认入口
- **THEN** 自举激活 MUST NOT 将它迁移或覆盖为当前源码入口
- **AND** 需要安装修复时 MUST 由相应安装能力核对真实归属和授权后处理

#### Scenario: Retained runtime 不满足最低版本
- **WHEN** 明确的 Node 版本不受支持或不可执行
- **THEN** 执行器 MUST 在相关激活动作前停止并报告可复核原因
- **AND** MUST NOT 从 PATH 随机换用另一个 Node 继续

#### Scenario: 自举收尾恢复闭环
- **WHEN** 已交付成果的自举激活需要恢复
- **THEN** MUST 以同一真实交付输入交给唯一执行器重新核对并恢复相关动作
- **AND** MUST 保留已成立的交付，不要求旧 Finish resume 或补造任务状态

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
