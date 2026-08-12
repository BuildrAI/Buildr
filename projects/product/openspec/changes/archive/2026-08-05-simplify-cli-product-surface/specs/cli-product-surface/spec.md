## MODIFIED Requirements

### Requirement: CLI 产品表面必须显式分层
Buildr MUST 将当前可执行命令、兼容输入和内部数据标识区分为 `primary`、`agent-machine`、`maintenance` 与 `legacy` 产品表面，并在 command metadata、help、产品文档、current-state knowledge 和验证中保持同一分类。该分类只控制可发现性与兼容承诺，不改变命令自身的授权、安全契约或可执行 effects。

#### Scenario: Public workspace surface
- **WHEN** 用户或 Agent 查看 Buildr 根帮助与主产品文档
- **THEN** Buildr MUST 在 primary 区展示普通工作路径需要的 workspace 初始化、核心范围维护、诊断、恢复、同步和本地应用入口
- **AND** `buildr app --target <workspace>` MUST 继续作为人查看 Workspace 并执行受控 metadata 修改的主产品入口
- **AND** primary 区 MUST NOT 混入产品构建、开发预览、OpenSpec workflow internals 或 legacy migration actions

#### Scenario: Agent machine surface
- **WHEN** Agent、Skill、doctor repair 或 bootstrap 需要低频但正式支持的确定性命令
- **THEN** 对应 command MUST 保持可执行、具有 canonical help 和稳定契约
- **AND** 根帮助 MUST 将其置于独立 agent-machine 区，而不能仅因底层或高级而标为 unsupported/internal

#### Scenario: Internal maintenance surface
- **WHEN** 根帮助或产品文档提及产品构建、开发预览、自举或 workflow 编排命令
- **THEN** Buildr MUST 将这些入口与普通 workspace 用户主路径分区并标明 maintenance 用途
- **AND** `buildr app preview start|list|stop` MUST 作为 Agent 并行验收 task worktree 的 maintenance 开发入口继续可用

#### Scenario: Legacy surface
- **WHEN** 兼容窗口内的旧调用命中 retained legacy command
- **THEN** Buildr MUST 保持已声明的兼容行为并在 topic/structured result 中给出 replacement 或迁移说明
- **AND** canonical 根帮助与新使用说明 MUST NOT 把 legacy command 推荐为当前工作路径

#### Scenario: Local application help
- **WHEN** 用户运行 `buildr app --help`、`buildr help app` 或 preview 子命令帮助
- **THEN** Buildr MUST 说明默认本机应用与 task preview 的边界、target、loopback、port、实例身份、页面修改白名单和 prompt-only 新增边界
- **AND** help MUST 明确 preview 不安装或替换 `Buildr Dev.app`
- **AND** help MUST NOT 声称本地应用提供数据库、远程服务或 Agent session connector

#### Scenario: Workspace init description help
- **WHEN** 用户运行 `buildr init --help`
- **THEN** Buildr MUST 展示可选 `--description <description>` 参数
- **AND** help MUST 说明未提供说明时会产生待补全提示，而不是静默编造 Workspace 说明

### Requirement: 产品表面分类必须由验证保护
Buildr 产品验证 MUST 从同一 command metadata authority 验证 executable route、canonical leaf/aggregate help、surface 分类、legacy replacement 和 unknown-command candidates 的一致性，防止 help、docs、spec 和实现再次漂移；验证 MUST NOT 仅以固定 command 数量或重复硬编码完整 key 清单保护存量表面。

#### Scenario: Verify retained route discoverability
- **WHEN** 产品验证遍历 command metadata 中的 executable routes
- **THEN** 每个 route MUST 具有唯一 key、合法 surface 和可查询的 canonical help topic
- **AND** 每个声明的 aggregate topic MUST 可以通过 `buildr help <topic...>` 与 `<topic...> --help` 查询

#### Scenario: Verify help and compatibility boundaries
- **WHEN** 产品验证渲染根帮助和当前 CLI Reference
- **THEN** primary、agent-machine、maintenance 与 legacy MUST 按 metadata 分区
- **AND** maintenance/legacy entries MUST NOT 被硬编码进 primary 区

#### Scenario: Verify compatibility boundaries
- **WHEN** 产品验证检查 retained legacy Service/Skill/OpenSpec 输入
- **THEN** 验证 MUST 确认兼容行为、canonical replacement 与输出收敛
- **AND** 已明确删除的 route MUST 不存在于 executable catalog、help topics、unknown-command candidates 或 public JSON schema registry

#### Scenario: Verify internal source identity boundary
- **WHEN** package check 或产品测试检查随包 Skill source reference
- **THEN** 验证 MUST 确认 `package:<source-id>` 只能解析 package manifest 已声明的 source
- **AND** 主用户文档与公开 Skill authoring help MUST NOT 把该引用描述为用户 asset id

### Requirement: CLI 帮助入口必须支持命令式主题查询
Buildr CLI MUST 让 `help <command...>` 与既有 `<command...> --help`、`<command...> -h` 共享同一 canonical topic；所有 retained executable leaf command 及 metadata 明确声明的 aggregate command group MUST 可查询，且 topic identity MUST 来自同一 command authority。

#### Scenario: 查询一级命令帮助
- **WHEN** 用户运行 `buildr help doctor`
- **THEN** Buildr MUST 输出与 `buildr doctor --help` 相同的 canonical doctor 帮助
- **AND** 命令 MUST 以 0 退出且无 workspace 副作用

#### Scenario: 查询嵌套命令帮助
- **WHEN** 用户运行 `buildr help component install`
- **THEN** Buildr MUST 输出与 `buildr component install --help` 相同的 canonical topic
- **AND** 帮助 MUST NOT 回退到不相关的根帮助

#### Scenario: 查询聚合命令帮助
- **WHEN** 用户运行 `buildr help task finish` 或 `buildr task finish --help`
- **THEN** Buildr MUST 输出只列出 canonical `run|inspect` 的 Task Finish aggregate topic
- **AND** 命令 MUST 以 0 退出且不得创建或修改 finish run

#### Scenario: 遍历 retained leaf topics
- **WHEN** 产品验证对 command metadata 中每个 executable key 调用 `buildr help <key>`
- **THEN** 每个调用 MUST 返回该 key 的 canonical topic 并以 0 退出
- **AND** 不得存在可执行但无法通过 help 发现的 retained route

## ADDED Requirements

### Requirement: CLI command metadata 必须成为唯一产品表面 authority
Buildr MUST 通过一个封闭、可验证的 command metadata catalog 同时声明每个 executable command 的 canonical key、surface、summary、help topic、dispatch match 和执行 adapter；根帮助、主题帮助、unknown-command candidates 与表面验证 MUST 从该 catalog 派生，不得维护可独立漂移的完整 route/help key 清单。

#### Scenario: 登记新 command
- **WHEN** 产品新增一个 executable CLI command
- **THEN** 维护者 MUST 在同一 command descriptor 中提供 key、surface、summary、canonical help、match 和 run adapter
- **AND** dispatch、help 与 verification MUST 无需在第二份完整 key map 中重复登记即可发现该 command

#### Scenario: 删除 command
- **WHEN** 产品删除一个 executable CLI command descriptor
- **THEN** 该 command MUST 同时从 dispatch、root/topic help、unknown-command candidates 与 surface verification 中消失
- **AND** 删除操作 MUST NOT 要求继续修改另一份硬编码 supported-key 清单

#### Scenario: Metadata schema 非法
- **WHEN** command descriptor 缺少必需 metadata、使用未知 surface、重复 key 或声明 executable leaf 但没有 canonical help
- **THEN** 产品验证 MUST fail closed 并给出具体 command identity 与字段诊断

### Requirement: 零消费者的 OpenSpec 分阶段 CLI 必须退役
Buildr MUST 不再注册、执行或发布 `buildr openspec sync-plan` 与 `buildr openspec sync-apply`；确定性 expected tree 规划、隔离验证和条件式 canonical 应用 MUST 只作为 `buildr openspec converge` 单一事务的内部步骤保留。

#### Scenario: 调用已删除的 sync-plan
- **WHEN** 调用方运行 `buildr openspec sync-plan <change> ...`
- **THEN** CLI MUST 返回标准 unknown-command 诊断并以非零状态退出
- **AND** MUST NOT 写 plan sidecar、canonical spec、receipt 或 archive 状态

#### Scenario: 调用已删除的 sync-apply
- **WHEN** 调用方运行 `buildr openspec sync-apply <change> ...`
- **THEN** CLI MUST 返回标准 unknown-command 诊断并以非零状态退出
- **AND** MUST NOT读取旧 plan 作为授权、修改 canonical spec 或创建 convergence receipt

#### Scenario: 使用当前收敛事务
- **WHEN** OpenSpec Contract Guard 需要确定性收敛 active Change
- **THEN** 它 MUST 继续只调用 `buildr openspec converge`
- **AND** converge MUST 在单一 operation 中完成规划、projected strict validation、条件式应用、写后确认和 archive

#### Scenario: 保留仍有消费者的兼容入口
- **WHEN** 当前 Skill/Component 仍调用 `openspec baseline create`、proposal `openspec check` 或 `skills migrate-project-assets`
- **THEN** 本 Change MUST 将其标记为 legacy 并保留既有兼容行为
- **AND** 不得以删除 `sync-plan`/`sync-apply` 为由提前删除这些独立入口
