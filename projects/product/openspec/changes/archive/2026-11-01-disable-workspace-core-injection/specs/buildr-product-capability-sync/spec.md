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
- **AND** Buildr MUST NOT 要求根默认区块，也不得登记或安装独立 `buildr-core` 规则
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
- **THEN** Buildr sync MUST 保留文件原状，不恢复、替换或插入 required block
- **AND** Buildr MUST NOT 覆盖 `AGENTS.md` 的用户正文

#### Scenario: 迁入产品 baseline 规则
- **WHEN** 已有 workspace 使用旧版 package baseline rules
- **THEN** Buildr sync MUST NOT 将核心规则写入根 `AGENTS.md`，用户规则按实际存在的 `AGENTS.md` 发现
- **AND** Buildr MUST NOT 将 `runtime.md` 语义自动写入根 `AGENTS.md`

#### Scenario: 清单引用的旧共享资源不可解析
- **WHEN** workspace 清单中的官方 `resource:` 引用在当前共享集及退役封存中均不可解析
- **THEN** sync 收敛 MUST 将该条目按缺源处理并交由既有 installed/modified/missing 与 replaces 判定，不得因解析失败中断整次收敛
- **AND** 结果 MUST 在 findings 中定位该来源缺失，供 Agent 与用户解释

#### Scenario: MVP 不提供 migrate 命令
- **WHEN** Buildr 处于本变更的 MVP 实施阶段
- **THEN** Buildr MUST NOT 要求实现 `buildr migrate agents`
- **AND** Buildr MUST 通过 doctor 兼容提示保护已有 workspace

### Requirement: Buildr 产品交付必须单向物化
Buildr MUST将当前产品 `resources/workspace` 与 `resources/runtime` 视为产品交付源，并将用户 Workspace 和 Agent runtime 中的对应文件视为安装结果。

#### Scenario: Workspace target 单向物化
- **WHEN** Agent 使用当前 Buildr 产品执行 init 或 sync
- **THEN** Buildr MUST从 `resources/workspace/` 向目标 Workspace 物化 manifest 声明的资产
- **AND** Buildr MUST NOT从目标 Workspace 反向更新 Product Project 的资源源

#### Scenario: Runtime target 单向物化
- **WHEN** Agent 执行 `buildr skill install <agent>`、`buildr sync <agent>` 或 `buildr init --agent <agent>`
- **THEN** Buildr MUST从 `resources/runtime/` 安装 manifest 声明的产品入口 Agent Skill
- **AND** 安装后的 runtime 文件 MUST NOT成为产品 Skill 的源资产

#### Scenario: 未合并候选产品使用隔离目标验证
- **WHEN** Buildr 维护者使用未合并的 task worktree Product checkout 验证候选产品
- **THEN** init/sync MUST使用该 checkout 随附的 resources
- **AND** CLI update 测试 MUST使用隔离 Git checkout 或 npm prefix
- **AND** 验证目标 MUST是临时 Workspace 或 task worktree自身，而不是主开发工作区的自举 Workspace

#### Scenario: 相同候选 tree 集成后不重复物化验证
- **WHEN** 已完成隔离验证的候选 Git tree 未经内容改变集成到主开发分支
- **THEN** Buildr 开发流程 MUST NOT要求仅为重复产品验证而从主开发分支 checkout 再次 sync 主自举 Workspace
- **AND** 实际 Workspace 后续需要消费新版产品资产时 MAY独立执行 sync

#### Scenario: 保留 workspace 自有内容
- **WHEN** init/sync 向 Workspace 物化产品管理资产
- **THEN** Buildr MUST继续保留用户或自举 Workspace 自有的 `AGENTS.md` 正文和未由资源 manifest 管理的资产
- **AND** Buildr MUST只修复 manifest 声明的产品管理资产，根 `AGENTS.md` MUST 保持原状
