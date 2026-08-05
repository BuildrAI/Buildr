## MODIFIED Requirements

### Requirement: CLI 产品表面必须显式分层
Buildr MUST 将当前可执行命令区分为 `primary`、`agent-machine` 与 `maintenance` 三类产品表面，并在 command metadata、help、产品文档、current-state knowledge 和验证中保持同一分类。该分类只控制可发现性与支持承诺，不改变命令自身的授权、安全契约或可执行 effects。Buildr MUST NOT 注册 `legacy` command surface。

#### Scenario: Public workspace surface
- **WHEN** 用户或 Agent 查看 Buildr 根帮助与主产品文档
- **THEN** Buildr MUST 在 primary 区展示普通工作路径需要的 workspace 初始化、核心范围维护、诊断、恢复、同步和本地应用入口
- **AND** `buildr app --target <workspace>` MUST 继续作为人查看 Workspace 并执行受控 metadata 修改的主产品入口
- **AND** primary 区 MUST NOT 混入产品构建、开发预览或 OpenSpec workflow internals

#### Scenario: Agent machine surface
- **WHEN** Agent、Skill、doctor repair 或 bootstrap 需要低频但正式支持的确定性命令
- **THEN** 对应 command MUST 保持可执行、具有 canonical help 和稳定契约
- **AND** 根帮助 MUST 将其置于独立 agent-machine 区，而不能仅因底层或高级而标为 unsupported/internal

#### Scenario: Internal maintenance surface
- **WHEN** 根帮助或产品文档提及产品构建、开发预览、自举或 workflow 编排命令
- **THEN** Buildr MUST 将这些入口与普通 workspace 用户主路径分区并标明 maintenance 用途
- **AND** `buildr app preview start|list|stop` MUST 作为 Agent 并行验收 task worktree 的 maintenance 开发入口继续可用

#### Scenario: Legacy surface
- **WHEN** 调用方使用已退役 command
- **THEN** Buildr MUST 返回标准 unknown-command，而不是注册 legacy surface、alias 或隐藏入口
- **AND** canonical 根帮助与新使用说明 MUST NOT 展示 Legacy compatibility commands 分组

#### Scenario: Local application help
- **WHEN** 用户运行 `buildr app --help`、`buildr help app` 或 preview 子命令帮助
- **THEN** Buildr MUST 说明默认本机应用与 task preview 的边界、target、loopback、port、实例身份、页面修改白名单和 prompt-only 新增边界
- **AND** help MUST 明确 preview 不安装或替换 `Buildr Dev.app`
- **AND** help MUST NOT 声称本地应用提供数据库、远程服务或 Agent session connector

#### Scenario: Workspace init description help
- **WHEN** 用户运行 `buildr init --help`
- **THEN** Buildr MUST 展示可选 `--description <description>` 参数
- **AND** help MUST 说明未提供说明时会产生待补全提示，而不是静默编造 Workspace 说明

### Requirement: Canonical 输出不得推荐 legacy 形式
Buildr MUST NOT 在主帮助、主题帮助、bootstrap canonical 示例、doctor repair command 或当前使用说明中生成或推荐已删除的 Legacy CLI、Project Skill source 或旧 OpenSpec sidecar workflow。仍被其他 canonical specs 明确保留的 deprecated 参数兼容输入 MUST 与 executable command surface 分开描述，不得恢复 `legacy` command 分类。

#### Scenario: Legacy 输入仍被兼容
- **WHEN** 旧 workspace 使用仍由其他 canonical spec 明确保留的 deprecated 参数或数据输入
- **THEN** Buildr MUST 按对应 canonical spec 兼容解析或拒绝，并明确其非 canonical 状态
- **AND** Buildr MUST NOT 因输入兼容而恢复已删除 command、自动 Project Skill 迁移或 `legacy` command surface

#### Scenario: Legacy Project Skill source 不再自动迁移
- **WHEN** 旧 workspace 包含 Project Skill manifest 或用户请求 Project Skill source scope
- **THEN** Buildr MUST fail closed 并说明 workspace 是唯一 Skill source authority
- **AND** 当前 CLI MUST NOT 提供自动复制、合并、删除或迁移 Project Skill source 的 next action
- **AND** diagnostic MAY 要求用户在升级前使用旧版本完成迁移或人工审阅整理

#### Scenario: Unsupported layout is not compatibility surface
- **WHEN** 输入使用 canonical specs 已明确拒绝的 `organizations/<org>/` layout 或新的 Project Skill source scope
- **THEN** Buildr MUST 继续拒绝该输入
- **AND** 产品分类 MUST NOT 将它描述为受支持的 current source surface

#### Scenario: Canonical Skill 帮助使用新模型
- **WHEN** 用户查看 Skills add/remove/render、Project capability 或 runtime destination 帮助
- **THEN** 输出 MUST 将 workspace 说明为唯一 source authority
- **AND** MUST 将 Project 说明为 capability/applicability context
- **AND** MUST 将 user/workspace 说明为 runtime destinations

### Requirement: 产品表面分类必须由验证保护
Buildr 产品验证 MUST 从同一 command metadata authority 验证 executable route、canonical leaf/aggregate help、三类 surface 和 unknown-command candidates 的一致性，防止 help、docs、spec 和实现再次漂移；验证 MUST NOT 仅以固定 command 数量或重复硬编码完整 key 清单保护存量表面。

#### Scenario: Verify retained route discoverability
- **WHEN** 产品验证遍历 command metadata 中的 executable routes
- **THEN** 每个 route MUST 具有唯一 key、合法 surface 和可查询的 canonical help topic
- **AND** 每个声明的 aggregate topic MUST 可以通过 `buildr help <topic...>` 与 `<topic...> --help` 查询

#### Scenario: Verify help and compatibility boundaries
- **WHEN** 产品验证渲染根帮助和当前 CLI Reference
- **THEN** primary、agent-machine 与 maintenance MUST 按 metadata 分区
- **AND** maintenance entries MUST NOT 被硬编码进 primary 区
- **AND** 根帮助 MUST NOT 渲染 Legacy compatibility commands 分组

#### Scenario: Verify compatibility boundaries
- **WHEN** 产品验证调用已删除的 OpenSpec baseline/check 或 Project Skill migration route
- **THEN** 验证 MUST 确认 route 不存在于 executable catalog、help topics、unknown-command candidates 或 public JSON schema registry
- **AND** 每次调用 MUST 返回标准 unknown-command 且保持目标 workspace 零写入

#### Scenario: Verify internal source identity boundary
- **WHEN** package check 或产品测试检查随包 Skill source reference
- **THEN** 验证 MUST 确认 `package:<source-id>` 只能解析 package manifest 已声明的 source
- **AND** 主用户文档与公开 Skill authoring help MUST NOT 把该引用描述为用户 asset id

### Requirement: Skills CLI 明确区分 workspace source 与 render destination
Skills CLI MUST 将 workspace 作为唯一 source authority，并 MUST 使用 `--destination user|workspace` 表达 runtime 投射位置。Project Skill source scope MUST 被拒绝，且当前 CLI MUST NOT 提供自动迁移入口。

#### Scenario: skills add/remove canonical help
- **WHEN** 用户查看 `skills add` 或 `skills remove` 帮助
- **THEN** canonical usage MUST 只要求 Buildr workspace target
- **AND** MUST NOT 推荐 Project source scope

#### Scenario: skills render canonical help
- **WHEN** 用户查看 `skills render` 帮助
- **THEN** CLI MUST 解释 `--target` 是 source workspace
- **AND** MUST 解释 `--destination workspace` 写当前工作目录 runtime、`--destination user` 写当前 Agent 用户层
- **AND** 省略 destination 的兼容默认 MUST 为 `workspace`

#### Scenario: legacy Project scope
- **WHEN** 用户执行带 `--scope projects/<project>` 的 Skills 命令
- **THEN** CLI MUST 返回结构化 breaking diagnostic
- **AND** diagnostic MUST NOT 包含当前版本可执行的 Project Skill migration command

### Requirement: OpenSpec CLI help 不得恢复 Task Finish 的旧 Change authority
Buildr CLI MUST 只把 `openspec converge` 与 `openspec audit`描述为当前 OpenSpec maintenance 入口，并 MUST NOT 注册或帮助展示 `openspec baseline create`、`openspec check`。Task Finish current help MUST 明确 Change convergence、sync 与 archive 在 Development stable Content Target 之前完成。

#### Scenario: 查询 OpenSpec 兼容入口帮助
- **WHEN** 用户查询 `buildr help openspec baseline create`、`buildr help openspec check` 或直接调用这些命令
- **THEN** CLI MUST 返回标准 unknown-command 诊断
- **AND** MUST NOT 读取或写入旧 baseline、pre-sync receipt、canonical spec 或 archive 状态

#### Scenario: 查询 Task Finish 帮助
- **WHEN** 用户查询 canonical Task Finish help
- **THEN** help MUST 说明 Finish 只消费 current Development Handoff 并执行 carrier/delivery/cleanup
- **AND** MUST NOT 列出 OpenSpec command、Change convergence、sync 或 archive 为 Finish operation

### Requirement: 零消费者的 OpenSpec 分阶段 CLI 必须退役
Buildr MUST 不再注册、执行或发布 `buildr openspec baseline create`、`buildr openspec check`、`buildr openspec sync-plan` 与 `buildr openspec sync-apply`；旧 baseline、pre-sync/post-sync stage 与 sidecar workflow MUST 不再拥有 current writer 或 reader。确定性 expected tree、冲突检查、隔离验证、条件式 canonical 应用与写后确认 MUST 只由 `buildr openspec converge` 单一事务持有。

#### Scenario: 调用已删除的 sync-plan
- **WHEN** 调用方运行 `buildr openspec sync-plan <change> ...`
- **THEN** CLI MUST 返回标准 unknown-command 诊断并以非零状态退出
- **AND** MUST NOT 写 plan、baseline、pre-sync receipt、canonical spec、convergence receipt 或 archive 状态

#### Scenario: 调用已删除的 sync-apply
- **WHEN** 调用方运行 `buildr openspec sync-apply <change> ...`
- **THEN** CLI MUST 返回标准 unknown-command 诊断并以非零状态退出
- **AND** MUST NOT 读取旧 plan 作为授权、修改 canonical spec 或创建 convergence receipt

#### Scenario: 使用当前收敛事务
- **WHEN** OpenSpec Contract Guard 需要确定性收敛 active Change
- **THEN** 它 MUST 只调用 `buildr openspec converge`
- **AND** converge MUST 在单一 operation 中完成冲突检查、规划、projected strict validation、条件式应用、写后确认和 archive

#### Scenario: Fresh Change 进入 apply
- **WHEN** 一个没有旧 baseline sidecar 的新 Change 完成 apply-required artifacts
- **THEN** OpenSpec consumer MUST 使用 upstream strict validation 与 Planning Review 进入实现
- **AND** MUST NOT 创建、刷新、读取或要求旧 contract baseline

#### Scenario: 保留仍有消费者的兼容入口
- **WHEN** 当前或旧 consumer 调用 `openspec baseline create`、proposal `openspec check` 或 `skills migrate-project-assets`
- **THEN** Buildr MUST 返回标准 unknown-command，不保留兼容行为或 replacement route
- **AND** MUST NOT 读取或写入旧 sidecar、Project Skill source 或 capability context

## ADDED Requirements

### Requirement: Legacy Project Skill 自动迁移必须退役
Buildr MUST 不再注册、执行或发布 `buildr skills migrate-project-assets`，并 MUST 删除扫描、复制、合并或删除 Project Skill source 的自动迁移能力。workspace Skill registry MUST 继续作为唯一 source authority，Project MUST 只表达 capability context。

#### Scenario: 调用已删除迁移命令
- **WHEN** 调用方运行 `buildr skills migrate-project-assets --check` 或 `--apply`
- **THEN** CLI MUST 返回标准 unknown-command 诊断并以非零状态退出
- **AND** MUST NOT 读取、复制、写入或删除 workspace/Project Skill source、manifest、contract 或 capability context

#### Scenario: Doctor 遇到旧 Project Skill source
- **WHEN** Doctor 观察到 Project 下仍存在旧 Skill manifest 或 source
- **THEN** Doctor MUST 报告 unsupported/fail-closed diagnostic
- **AND** MUST NOT 推荐当前版本不存在的 migration command 或执行自动修复
