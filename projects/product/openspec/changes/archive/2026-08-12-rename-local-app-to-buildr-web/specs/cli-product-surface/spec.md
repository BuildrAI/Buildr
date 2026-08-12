## ADDED Requirements

### Requirement: CLI 产品表面必须显式分层并采用 Buildr Web 主入口
Buildr MUST 将当前可执行命令区分为 `primary`、`agent-machine` 与 `maintenance` 三类产品表面，并在 command metadata、help、产品文档、current-state knowledge 和验证中保持同一分类。该分类只控制可发现性与支持承诺，不改变命令自身的授权、安全契约或可执行 effects。Buildr MUST NOT 注册 `legacy` command surface。

#### Scenario: Public workspace surface
- **WHEN** 用户或 Agent 查看 Buildr 根帮助与主产品文档
- **THEN** Buildr MUST 在 primary 区展示普通工作路径需要的 workspace 初始化、核心范围维护、诊断、恢复、同步和 Buildr Web 入口
- **AND** `buildr web --target <workspace>` MUST 继续作为人查看 Workspace 并执行受控 metadata 修改的主产品入口
- **AND** primary 区 MUST NOT 混入产品构建、开发预览或 OpenSpec workflow internals

#### Scenario: Agent machine surface
- **WHEN** Agent、Skill、doctor repair 或 bootstrap 需要低频但正式支持的确定性命令
- **THEN** 对应 command MUST 保持可执行、具有 canonical help 和稳定契约
- **AND** 根帮助 MUST 将其置于独立 agent-machine 区，而不能仅因底层或高级而标为 unsupported/internal

#### Scenario: Internal maintenance surface
- **WHEN** 根帮助或产品文档提及产品构建、开发预览、自举或 workflow 编排命令
- **THEN** Buildr MUST 将这些入口与普通 workspace 用户主路径分区并标明 maintenance 用途
- **AND** `buildr web preview start|list|stop` MUST 作为 Agent 并行验收 task worktree 的 maintenance 开发入口继续可用

#### Scenario: Legacy surface
- **WHEN** 调用方使用已退役 command
- **THEN** Buildr MUST 返回标准 unknown-command，而不是注册 legacy surface、alias 或隐藏入口
- **AND** canonical 根帮助与新使用说明 MUST NOT 展示 Legacy compatibility commands 分组

#### Scenario: Buildr Web help
- **WHEN** 用户运行 `buildr web --help`、`buildr help web` 或 preview 子命令帮助
- **THEN** Buildr MUST 说明默认 Buildr Web 与 task preview 的边界、target、loopback、port、实例身份、页面修改白名单和 prompt-only 新增边界
- **AND** help MUST 明确 preview 不安装或替换 `Buildr Web Dev.app`
- **AND** help MUST NOT 声称 Buildr Web 提供数据库、远程服务或 Agent session connector

#### Scenario: Workspace init description help
- **WHEN** 用户运行 `buildr init --help`
- **THEN** Buildr MUST 展示可选 `--description <description>` 参数
- **AND** help MUST 说明未提供说明时会产生待补全提示，而不是静默编造 Workspace 说明

### Requirement: Buildr Web 命令族必须是唯一当前本机 Web 产品入口
Buildr CLI MUST 只将 `web` 注册为当前本机 Web 产品的 executable domain。`buildr web`、`buildr web launcher install|status|uninstall` 与 `buildr web preview start|list|stop` MUST 分别复用现有 Runtime、Launcher 与 preview Application；CLI MUST NOT 注册 `app` domain、隐藏 alias、legacy surface 或第二套路由。

#### Scenario: 根帮助展示主入口
- **WHEN** 用户运行 `buildr --help`
- **THEN** primary 产品表面 MUST 展示 `buildr web`
- **AND** executable catalog、帮助主题和 examples MUST NOT 包含 `buildr app`

#### Scenario: Web 主题帮助一致
- **WHEN** 用户分别运行 `buildr web --help` 与 `buildr help web`
- **THEN** 两个入口 MUST 返回完整且一致的 Buildr Web 帮助
- **AND** help MUST 包含 launcher、preview maintenance surface、loopback、按需启动与 `--no-open` 边界

#### Scenario: 旧 app domain 按标准 unknown command 处理
- **WHEN** 调用方运行 `buildr app`、`buildr help app` 或任一 `buildr app ...` 子命令
- **THEN** CLI MUST 使用现有标准 unknown-command diagnostic 和非零退出码
- **AND** suggestion、candidate、Doctor repair、bootstrap 或 Skill 指引 MUST NOT 推荐 `app` domain

#### Scenario: 普通 CLI 不启动 Web Runtime
- **WHEN** 调用方运行不属于 `web` domain 的普通 CLI 命令
- **THEN** CLI MUST NOT 启动 loopback HTTP 服务或创建 Buildr Web instance state
- **AND** Buildr Web Runtime MUST 只在 `buildr web` 或其明确 preview/Launcher 启动路径中按需启动

## MODIFIED Requirements

### Requirement: Project CLI 必须使用 canonical Domain 术语
Buildr CLI MUST expose Project creation and diagnostics using `code`, `name`, source and integration branch terminology while preserving explicit legacy input compatibility.

#### Scenario: Project create help
- **WHEN** 用户运行 `buildr project create --help`
- **THEN** help MUST document `--name`, `--description`, `--repo`, `--remote` and `--integration-branch`
- **AND** help MUST explain workspace versus Git source and MUST NOT call integration branch the current branch

#### Scenario: Legacy title input
- **WHEN** an existing automation uses `--title`
- **THEN** CLI MUST accept it as compatibility input and map it to Project `name`
- **AND** canonical output and examples MUST use `--name`

#### Scenario: App help includes Project boundary
- **WHEN** 用户运行 `buildr web --help`
- **THEN** help MUST mention Project list/detail and low-risk name/description edits
- **AND** help MUST state that Project creation is prompt-only and Git state changes are not performed by the UI

### Requirement: Task Environment 必须提供 Plan 与 Environment 薄公共 CLI actions
Buildr CLI MUST公开`task environment plan record|inspect`以及`task environment prepare|inspect|cleanup`。Plan record MUST只接收`--input <json-file>`中的closed Plan；prepare MUST支持可选`--plan <json-file>`并在省略时复用current Plan。所有CLI MUST只负责参数解析、Application调用、JSON/文本输出和退出码；Buildr Web MUST使用saved-current reader。

#### Scenario: 查看 Task Environment 帮助
- **WHEN** 用户运行`buildr help task environment`或action help
- **THEN** 帮助 MUST展示Plan登记/读取以及prepare/inspect/cleanup
- **AND** MUST说明Plan由Agent形成、prepare执行、inspect零写入且Receipt不属于Task Record

#### Scenario: 登记 Plan
- **WHEN** Agent运行`task environment plan record <task-id> --input <file>`
- **THEN** CLI MUST把解析后的Plan交给Application并返回Plan identity/currentness
- **AND** MUST不执行Plan Steps或接受完整Receipt/next state

#### Scenario: 准备或恢复 Environment
- **WHEN** Agent运行prepare并可选传入Plan
- **THEN** CLI MUST返回ready/blocked、execution roots、Plan及逐Service/Step facts和effects
- **AND** MUST不选择技术栈、扫描manifest或直接调用Git provider形成总结果

#### Scenario: 只读检查 Environment
- **WHEN** 调用方运行inspect
- **THEN** CLI MUST只读返回current Plan、executable/input/output observations和Environment read model
- **AND** MUST不执行Step、创建output、创建checkout、启动/停止资源或cleanup

#### Scenario: cleanup 与内部资源边界
- **WHEN** 调用方运行cleanup或检查public registry
- **THEN** cleanup MUST只转交已授权handoff/abandon facts，resource register/release与saved-current read MUST保持内部
- **AND** CLI MUST不接受任意shell、删除路径或caller-authored provider result

### Requirement: Task Record 必须提供六个明确 CLI action
Buildr CLI MUST公开 `buildr task create <task-id>`、`inspect`、`update`、`activate`、`complete` 和 `abandon`，并 MUST在帮助中将它们描述为 Task Manager 的确定性记录动作。CLI interface MUST只拥有参数解析、Application 调用、输出和退出码；Task Record Application MUST NOT解析 argv、打印 stdout/stderr、修改 process exit state 或向客户端暴露 SQL/storage internals。现有 `buildr task finish run|inspect` MUST保持当前专业语义，直到 Task Finish 模块被替换。

#### Scenario: 查看 Task Manager 帮助
- **WHEN** 用户运行 `buildr help task` 或任一 Task Record action help
- **THEN** CLI MUST展示精确 usage、canonical Workspace target、required/repeatable/exclusive flags、副作用与停止条件
- **AND** MUST说明 todo 只写 SQLite、activate 不执行 Git/Environment，且 Task Manager 不管理专业阶段或自动 publication

#### Scenario: CLI 与 Application 分层
- **WHEN** command registry 路由任一 Task Record action
- **THEN** CLI interface MUST将结构化 action input 交给共享 Application，并把 result 映射为人类或 JSON 输出
- **AND** Application MUST保持可由 Buildr Web 直接复用，不依赖 argv、stdout/stderr、CLI process state 或客户端 SQL

#### Scenario: 创建 Task Record
- **WHEN** 调用方运行 `buildr task create <task-id> --title <text> --intent <text>`，按需提供 `--status todo|active`、scope/Change 或重复 `--retrospective-source <task-id>`
- **THEN** CLI MUST将明确参数交给 create Application，并只在 SQLite authority 中记录不存在且校验通过时原子创建
- **AND** status 省略时 MUST 保持 active 默认；todo MUST 拒绝 Change 且不得隐式创建任何外部或专业资产

#### Scenario: 检查 Task Record
- **WHEN** 调用方运行 `buildr task inspect <task-id>`
- **THEN** CLI MUST只读返回 canonical logical Task Record、复盘来源与 response-level digest
- **AND** MUST NOT创建数据库、更新 `updatedAt`、status、result 或任何业务字段

#### Scenario: 更新 Task Record
- **WHEN** 调用方运行 `buildr task update <task-id>` 并提供至少一个登记的 set/add/remove flag，包括复盘来源 flag
- **THEN** CLI MUST由 Application 对 transaction 内最新 todo/active record 应用明确 mutation并验证最终完整记录
- **AND** MUST NOT接受完整 next-state document、SQL 或任意 JSON/YAML patch

#### Scenario: 激活 Task Record
- **WHEN** 调用方运行 `buildr task activate <task-id>`
- **THEN** CLI MUST只允许 Application 执行 todo-to-active transition
- **AND** MUST NOT执行 Git baseline、Environment、Change、Development、commit 或 push

#### Scenario: 完成或放弃 Task
- **WHEN** 调用方运行 `complete` 或 `abandon`
- **THEN** CLI MUST由 Application 执行合法 todo/active-to-terminal transition
- **AND** MUST NOT从专业 records 推断结果或自动执行 Finish、cleanup、commit 或 push

#### Scenario: 已知业务冲突
- **WHEN** action 遇到重复 Task ID、非法状态/来源/scope/Change、终态改写、database/schema failure 或 canonical Workspace 冲突
- **THEN** CLI MUST返回当前 Task Record result family 的 structured blocked result并以非零状态退出
- **AND** MUST包含稳定 code、未发生 effects 与唯一恢复 next action

#### Scenario: Task Finish 命令保持兼容
- **WHEN** 用户运行现有 `buildr task finish run|inspect` 或对应帮助
- **THEN** CLI MUST继续匹配现有三段式 command key 与当前 Task Finish 契约
- **AND** 新增 `task activate` MUST NOT遮蔽或误解析 `task finish` actions

## REMOVED Requirements

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
