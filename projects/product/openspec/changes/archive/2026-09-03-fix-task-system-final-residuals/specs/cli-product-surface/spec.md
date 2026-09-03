## MODIFIED Requirements

### Requirement: Task Record 必须提供六个明确 CLI action
Buildr CLI MUST公开 `buildr task create <task-id>`、`inspect`、`update`、`activate`、`complete` 和 `abandon`。`buildr help task` MUST列出全部六个 action。CLI interface MUST只拥有参数解析、Application 调用、输出和退出码；帮助 MUST准确说明每个动作是否写 Task SQLite，以及不会隐式执行的 Git、验证、交付、发布或清理副作用。Task Record Application MUST不解析 argv、打印 stdout/stderr、修改 process exit state 或暴露 SQL/storage internals。

#### Scenario: 查看 Task Manager 帮助
- **WHEN** 用户运行 `buildr help task` 或任一 Task Record action help
- **THEN** CLI MUST展示精确 usage、`activate`、canonical Workspace target、参数、副作用与停止条件
- **AND** create MUST不再声称复盘来源可重复，update MUST说明带原因和当前摘要的终态事实更正，abandon MUST不声称终态永远不可修改

#### Scenario: CLI 与 Application 分层
- **WHEN** command registry 路由任一 Task Record action
- **THEN** CLI MUST将结构化 action input 交给共享 Application 并映射输出
- **AND** Application MUST保持可由 Buildr Web 复用

#### Scenario: 创建 Task Record
- **WHEN** 调用方运行 `buildr task create` 并提供合法目标、范围和状态
- **THEN** CLI MUST只在 SQLite authority 中原子创建 Task
- **AND** MUST不创建 Change、执行 Git、验证、交付或清理

#### Scenario: 检查 Task Record
- **WHEN** 调用方运行 `buildr task inspect <task-id>`
- **THEN** CLI MUST只读返回 Task Record、Parent/Child、复盘登记摘要、record digest 与引用局部诊断
- **AND** MUST不更新任何业务字段

#### Scenario: 更新 Task Record
- **WHEN** 调用方运行 `buildr task update <task-id>` 并提供普通 mutation、终态事实更正或独立复盘两态 mutation
- **THEN** Application MUST校验当前 record digest、适用原因、实际新增引用与适用文档摘要
- **AND** MUST不执行 Git、验证、交付或清理

#### Scenario: 激活 Task Record
- **WHEN** 调用方运行 `buildr task activate <task-id>`
- **THEN** CLI MUST只允许 todo-to-active transition
- **AND** MUST不执行 Git、开发、验证、交付或清理

#### Scenario: 完成或放弃 Task
- **WHEN** 调用方运行 `complete` 或 `abandon`
- **THEN** Application MUST执行合法 todo/active-to-terminal transition
- **AND** MUST不自动执行 Review、Verification、Git、publication 或 cleanup

#### Scenario: 已知业务冲突
- **WHEN** action 遇到重复 Task、非法状态/scope/Change、摘要冲突、文档摘要漂移或 canonical Workspace 冲突
- **THEN** CLI MUST返回 structured blocked result 和稳定恢复动作
- **AND** MUST保持 Task 与文档零额外写入

#### Scenario: Task Finish 命令保持兼容
- **WHEN** 用户运行当前默认 Task Finish 相关入口
- **THEN** CLI MUST保持其 Skill-only 组合语义
- **AND** Task Record 复盘字段 MUST不成为 Finish 依赖

#### Scenario: 登记本机复盘文档
- **WHEN** 调用方对 terminal Task 提交当前 record digest、实际文档摘要和 `pending-decision|decided`
- **THEN** Application MUST只保存摘要与状态并返回 current Task Record 结果
- **AND** MUST不生成或保存 Markdown 正文

## ADDED Requirements

### Requirement: Task Verification CLI 必须显式接收 current 摘要
`buildr task verification record` MUST要求 `--expected-report <absent|sha256-digest>`，并将其作为调用参数传给 Application。Help MUST说明调用方先 inspect、冲突后重新读取并判断，不自动重试。

#### Scenario: 查看 Verification record 帮助
- **WHEN** 用户查看 `task verification record` help
- **THEN** usage MUST包含必填 `--expected-report`
- **AND** MUST说明该命令只保存报告，不执行测试、Git、交付、Task 完成或清理
