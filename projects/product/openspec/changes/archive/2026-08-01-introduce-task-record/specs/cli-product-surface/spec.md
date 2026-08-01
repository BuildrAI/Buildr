## ADDED Requirements

### Requirement: Task Record 必须提供五个明确 CLI action
Buildr CLI MUST 公开 `buildr task create <task-id>`、`inspect`、`update`、`complete` 和 `abandon`，并 MUST 在帮助中将它们描述为 Task Manager 的确定性记录动作。CLI interface MUST 只拥有参数解析、Application 调用、输出和退出码；Task Record Application MUST NOT 解析 argv、打印 stdout/stderr 或修改 process exit state。现有 `buildr task finish run|inspect` MUST 保持当前专业语义，直到 Task Finish 模块被替换。

#### Scenario: 查看 Task Manager 帮助
- **WHEN** 用户运行 `buildr help task` 或任一 Task Record action help
- **THEN** CLI MUST 展示精确 usage、canonical Workspace target、required/repeatable/exclusive flags、副作用与停止条件
- **AND** MUST 说明 Task Manager 不管理 Environment/专业阶段、不自动 Git publication，也不要求 Agent 直接编辑 YAML

#### Scenario: CLI 与 Application 分层
- **WHEN** command registry 路由任一 Task Record action
- **THEN** CLI interface MUST 将结构化 action input 交给共享 Application，并把 result 映射为人类或 JSON 输出
- **AND** Application MUST 保持可由 Local App 直接复用，不依赖 argv、stdout/stderr 或 CLI process state

#### Scenario: 创建 Task Record
- **WHEN** 调用方运行 `buildr task create <task-id> --title <text> --intent <text>` 并按需重复提供 `--project <code>`、`--service <project>/<service>` 或 `--change <project>/<change>`
- **THEN** CLI MUST 将明确参数交给 create Application 并只在 canonical record 不存在且校验通过时创建 active Task
- **AND** MUST NOT 隐式创建 task environment、OpenSpec Change、Git branch、commit、push 或专业 Receipt/Result

#### Scenario: 检查 Task Record
- **WHEN** 调用方运行 `buildr task inspect <task-id>`
- **THEN** CLI MUST 只读返回 canonical Task Record 与 path
- **AND** MUST NOT 更新 `updatedAt`、status、result 或任何业务字段

#### Scenario: 更新 Task Record
- **WHEN** 调用方运行 `buildr task update <task-id>` 并提供至少一个登记的 set/add/remove flag
- **THEN** CLI MUST 由 Application 对磁盘最新 active record 应用明确 mutation 并验证最终完整记录
- **AND** MUST NOT 接受 `--input` 完整文档、`--expected-revision` 或任意 JSON/YAML patch

#### Scenario: 完成或放弃 Task
- **WHEN** 调用方运行 `buildr task complete <task-id> --summary <text> [--no-change]` 或 `buildr task abandon <task-id> --reason <text>`
- **THEN** CLI MUST 只允许 Application 执行对应 active-to-terminal transition
- **AND** MUST NOT 从专业 records 推断结果、自动执行 Finish、cleanup、commit 或 push

#### Scenario: 已知业务冲突
- **WHEN** action 遇到重复 Task ID、非法状态、终态改写、无效 scope/Change、损坏记录或 canonical Workspace 冲突
- **THEN** CLI MUST 返回 Task Record family 的 structured blocked result 并以非零状态退出
- **AND** MUST 包含稳定 code、未发生 effects 与唯一恢复 next action

#### Scenario: Task Finish 命令保持兼容
- **WHEN** 用户运行现有 `buildr task finish run|inspect` 或对应帮助
- **THEN** CLI MUST 继续匹配现有三段式 command key 与当前 Task Finish 契约
- **AND** 新增 `task inspect` MUST NOT 遮蔽或误解析 `task finish inspect`
