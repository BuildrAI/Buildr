## MODIFIED Requirements

### Requirement: Task Record 必须提供六个明确 CLI action
Buildr CLI MUST公开`buildr task create <task-id>`、`inspect`、`update`、`activate`、`complete`和`abandon`。CLI interface MUST只拥有参数解析、Application调用、输出和退出码；Task Record Application MUST NOT解析argv、打印stdout/stderr、修改process exit state或暴露SQL/storage internals。

#### Scenario: 查看 Task Manager 帮助
- **WHEN** 用户运行`buildr help task`或任一Task Record action help
- **THEN** CLI MUST展示精确usage、canonical Workspace target、参数、副作用与停止条件
- **AND** MUST说明复盘正文由Agent写入固定本机路径，Task Record只登记摘要与决定状态

#### Scenario: CLI 与 Application 分层
- **WHEN** command registry路由任一Task Record action
- **THEN** CLI MUST将结构化action input交给共享Application并映射输出
- **AND** Application MUST保持可由Buildr Web复用

#### Scenario: 创建 Task Record
- **WHEN** 调用方运行`buildr task create`并提供合法目标、范围和状态
- **THEN** CLI MUST只在SQLite authority中原子创建Task
- **AND** MUST不接受复盘来源或自动生成复盘文档

#### Scenario: 检查 Task Record
- **WHEN** 调用方运行`buildr task inspect <task-id>`
- **THEN** CLI MUST只读返回Task Record、Parent/Child、复盘文档登记摘要与record digest
- **AND** MUST不更新任何业务字段

#### Scenario: 更新 Task Record
- **WHEN** 调用方运行`buildr task update <task-id>`并提供普通Task mutation，或独立提供复盘文档两态mutation
- **THEN** Application MUST校验最新记录、record digest与适用文档摘要
- **AND** MUST不接受复盘来源、完整next-state、SQL或任意patch

#### Scenario: 激活 Task Record
- **WHEN** 调用方运行`buildr task activate <task-id>`
- **THEN** CLI MUST只允许todo-to-active transition
- **AND** MUST清除不再适用的复盘文档登记且不执行Git或开发

#### Scenario: 完成或放弃 Task
- **WHEN** 调用方运行`complete`或`abandon`
- **THEN** Application MUST执行合法todo/active-to-terminal transition
- **AND** MUST不自动提示、生成或登记复盘

#### Scenario: 已知业务冲突
- **WHEN** action遇到重复Task、非法状态/scope/Change、终态改写、文档摘要漂移或canonical Workspace冲突
- **THEN** CLI MUST返回structured blocked result和稳定恢复动作
- **AND** MUST保持Task与文档零额外写入

#### Scenario: Task Finish 命令保持兼容
- **WHEN** 用户运行现有Task Finish相关入口
- **THEN** CLI MUST保持其当前独立语义
- **AND** Task Record复盘字段 MUST不成为Finish依赖

#### Scenario: 登记本机复盘文档
- **WHEN** 调用方对terminal Task提交当前record digest、实际文档摘要和`pending-decision|decided`
- **THEN** Application MUST只保存摘要与状态并返回v5结果
- **AND** MUST不生成或保存Markdown正文
