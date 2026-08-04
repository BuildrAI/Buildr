## MODIFIED Requirements

### Requirement: Task Record 必须提供五个明确 CLI action
Buildr CLI MUST公开 `buildr task create <task-id>`、`inspect`、`update`、`complete` 和 `abandon`，并 MUST在帮助中将它们描述为 Task Manager 的确定性记录动作。CLI interface MUST只拥有参数解析、Application 调用、输出和退出码；Task Record Application MUST NOT解析 argv、打印 stdout/stderr、修改 process exit state 或向客户端暴露 SQL/storage internals。现有 `buildr task finish run|inspect` MUST保持当前专业语义，直到 Task Finish 模块被替换。

#### Scenario: 查看 Task Manager 帮助
- **WHEN** 用户运行 `buildr help task` 或任一 Task Record action help
- **THEN** CLI MUST展示精确 usage、canonical Workspace target、required/repeatable/exclusive flags、副作用与停止条件
- **AND** MUST说明 Task Manager 不管理 Environment/专业阶段、不自动 Git publication，也不要求 Agent 直接编辑 YAML 或 SQLite

#### Scenario: CLI 与 Application 分层
- **WHEN** command registry 路由任一 Task Record action
- **THEN** CLI interface MUST将结构化 action input 交给共享 Application，并把 result 映射为人类或 JSON 输出
- **AND** Application MUST保持可由 Local App 直接复用，不依赖 argv、stdout/stderr、CLI process state 或客户端 SQL

#### Scenario: 创建 Task Record
- **WHEN** 调用方运行 `buildr task create <task-id> --title <text> --intent <text>` 并按需重复提供 `--project <code>`、`--service <project>/<service>` 或 `--change <project>/<change>`
- **THEN** CLI MUST将明确参数交给 create Application，并只在 SQLite authority 中 canonical record 不存在且校验通过时创建 active Task
- **AND** MUST NOT隐式创建 task environment、OpenSpec Change、Git branch、commit、push 或专业 Receipt/Result

#### Scenario: 检查 Task Record
- **WHEN** 调用方运行 `buildr task inspect <task-id>`
- **THEN** CLI MUST只读返回 canonical logical Task Record 与 response-level digest
- **AND** MUST NOT创建数据库、更新 `updatedAt`、status、result 或任何业务字段

#### Scenario: 更新 Task Record
- **WHEN** 调用方运行 `buildr task update <task-id>` 并提供至少一个登记的 set/add/remove flag
- **THEN** CLI MUST由 Application 对 transaction 内最新 active record 应用明确 mutation 并验证最终完整记录
- **AND** MUST NOT接受 `--input` 完整文档、`--expected-revision`、SQL 或任意 JSON/YAML patch

#### Scenario: 完成或放弃 Task
- **WHEN** 调用方运行 `buildr task complete <task-id> --summary <text> [--no-change]` 或 `buildr task abandon <task-id> --reason <text>`
- **THEN** CLI MUST只允许 Application 执行对应 active-to-terminal transition
- **AND** MUST NOT从专业 records 推断结果、自动执行 Finish、cleanup、commit 或 push

#### Scenario: 已知业务冲突
- **WHEN** action 遇到重复 Task ID、非法状态、终态改写、无效 scope/Change、database/schema failure 或 canonical Workspace 冲突
- **THEN** CLI MUST返回 Task Record v2 family 的 structured blocked result 并以非零状态退出
- **AND** MUST包含稳定 code、未发生 effects 与唯一恢复 next action

#### Scenario: Task Finish 命令保持兼容
- **WHEN** 用户运行现有 `buildr task finish run|inspect` 或对应帮助
- **THEN** CLI MUST继续匹配现有三段式 command key 与当前 Task Finish 契约
- **AND** 新增 `task inspect` MUST NOT遮蔽或误解析 `task finish inspect`
