## ADDED Requirements

### Requirement: Task Record 必须提供六个明确 CLI action
Buildr CLI MUST公开 `buildr task create <task-id>`、`inspect`、`update`、`activate`、`complete` 和 `abandon`，并 MUST在帮助中将它们描述为 Task Manager 的确定性记录动作。CLI interface MUST只拥有参数解析、Application 调用、输出和退出码；Task Record Application MUST NOT解析 argv、打印 stdout/stderr、修改 process exit state 或向客户端暴露 SQL/storage internals。现有 `buildr task finish run|inspect` MUST保持当前专业语义，直到 Task Finish 模块被替换。

#### Scenario: 查看 Task Manager 帮助
- **WHEN** 用户运行 `buildr help task` 或任一 Task Record action help
- **THEN** CLI MUST展示精确 usage、canonical Workspace target、required/repeatable/exclusive flags、副作用与停止条件
- **AND** MUST说明 todo 只写 SQLite、activate 不执行 Git/Environment，且 Task Manager 不管理专业阶段或自动 publication

#### Scenario: CLI 与 Application 分层
- **WHEN** command registry 路由任一 Task Record action
- **THEN** CLI interface MUST将结构化 action input 交给共享 Application，并把 result 映射为人类或 JSON 输出
- **AND** Application MUST保持可由 Local App 直接复用，不依赖 argv、stdout/stderr、CLI process state 或客户端 SQL

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

### Requirement: Task Record 必须提供五个明确 CLI action
**Reason**: Task Record v2 新增显式 todo-to-active 转换，五动作集合已无法完整表达公开入口。

**Migration**: 保留原有五个 action 语义，并增加 `activate`；调用方无需改写现有命令。
