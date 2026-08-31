## MODIFIED Requirements

### Requirement: Buildr 内置能力层
Buildr MUST 在每个 Buildr workspace 中支持由产品管理的 Rules、Skills 和 Commands 内置能力层。

#### Scenario: 内置能力目录
- **WHEN** Buildr 初始化或同步 workspace
- **THEN** Buildr MUST 能够在 `rules/buildr/` 和 `skills/buildr/` 下物化产品管理的内置 Rule 和 Skill
- **AND** Buildr MUST 将内置 Commands 声明写入 `commands/manifest.yml`
- **AND** 用户管理的 Rules、Skills 和 Commands MUST 与内置能力共用对应 manifest

#### Scenario: 内置能力分 required 和 optional
- **WHEN** Buildr 提供内置 Rules、Skills 或 Commands
- **THEN** Buildr MUST 支持 `required: true` 和 `required: false`
- **AND** 根 `AGENTS.md` 受管区块 MUST 是必读入口，不再登记或安装独立 `buildr-core` 规则
- **AND** optional 内置能力 MUST 支持显式卸载

#### Scenario: 内置能力状态跟踪
- **WHEN** Buildr 跟踪内置能力状态
- **THEN** Buildr MUST 区分 `installed`、`modified`、`uninstalled` 和 `missing`
- **AND** Buildr MUST 在对应 manifest 中持久化显式卸载状态，确保 sync 和 doctor 不把它误判为意外损坏
- **AND** Buildr MUST 通过安装回执区分上一版官方资产与用户修改

#### Scenario: 官方内置能力自动升级
- **WHEN** workspace live 内容精确匹配上次安装回执或 package 声明的已知旧版官方完整性
- **THEN** Buildr sync MUST 自动升级到当前 package 内容
- **AND** Buildr MUST NOT 要求用户确认是否同步 Buildr 自身更新

#### Scenario: 修改过的内置能力不被静默覆盖
- **WHEN** 某个内置能力的 live 内容不匹配上次安装回执、当前 package 或已知旧版官方完整性
- **THEN** Buildr sync MUST NOT 在没有用户明确决策时覆盖 optional 内置能力
- **AND** doctor MUST 报告该修改状态，并提供足够上下文让用户选择还原或保留

#### Scenario: 已卸载的内置能力默认不还原
- **WHEN** 某个内置能力被标记为 `uninstalled`
- **THEN** Buildr sync MUST NOT 默认还原它
- **AND** doctor SHOULD 将其作为 info 而不是 warning 报告

### Requirement: 已有 workspace 升级兼容
Buildr MUST 通过 sync 支持已有 Buildr workspace 升级到内置能力和 adapter render 模型，同时不静默覆盖用户编写的规则正文。

#### Scenario: 修复根 AGENTS required block
- **WHEN** 已有 workspace 的根 `AGENTS.md` 缺少或破坏 Buildr required block
- **THEN** Buildr sync MUST 恢复 required block，使其正文与随包内联规则一致
- **AND** Buildr MUST NOT 覆盖 `AGENTS.md` 的用户正文

#### Scenario: 迁入产品 baseline 规则
- **WHEN** 已有 workspace 使用旧版 package baseline rules
- **THEN** Buildr sync MUST 将核心规则内联到根 `AGENTS.md`，其他专业规则仍使用通用规则清单
- **AND** `runtime.md` 的语义 MUST 内化进 根 `AGENTS.md` 受管区块

#### Scenario: MVP 不提供 migrate 命令
- **WHEN** Buildr 处于本变更的 MVP 实施阶段
- **THEN** Buildr MUST NOT 要求实现 `buildr migrate agents`
- **AND** Buildr MUST 通过 doctor 兼容提示保护已有 workspace

## ADDED Requirements

### Requirement: 安全退役独立核心规则
Buildr MUST 通过现有同步与更新路径退役独立核心规则，不新增迁移框架或命令。只有路径、登记归属和安装回执与当前普通文件完整性均匹配时，系统 MUST 自动删除遗留文件及专属登记回执；已不存在的受管文件也 MUST 清除其专属元数据。

#### Scenario: 官方旧文件完整迁移
- **WHEN** 遗留核心规则与其受管登记和上次安装回执匹配
- **THEN** 同步 MUST 内联新规则并删除旧文件、专属登记和回执
- **AND** 重复同步 MUST 幂等

#### Scenario: 已修改或未知归属的旧文件
- **WHEN** 遗留文件被修改、回执缺失、路径不符或不是安全的普通文件
- **THEN** 系统 MUST 保留文件并报告局部诊断，不阻塞内联规则与其他安全同步
- **AND** 能确认是原核心规则的受管登记 MUST 停用其必读与启用状态，避免双重规则权威
- **AND** 归属不明的登记 MUST 保留，不猜测为 Buildr 可删除资产

#### Scenario: 专业规则仍可用
- **WHEN** 用户登记、启停、引用或按需读取其他专业规则
- **THEN** 系统 MUST 保持其原有能力与数据，不因核心规则退役清空规则清单
