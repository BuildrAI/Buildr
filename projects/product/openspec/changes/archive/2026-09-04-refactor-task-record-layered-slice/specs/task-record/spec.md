## MODIFIED Requirements

### Requirement: 单文件写入必须保留最后一份有效记录并拒绝陈旧 Buildr Web 页面
Task Record persistence MUST只拥有 Workspace structured store 中的 `tasks`、`task_projects`、`task_services` 与 `task_changes` tables，并 MUST分别以 `TaskRepository`、`TaskProjectRepository`、`TaskServiceRepository` 与 `TaskChangeRepository` 封装各表 SQL、Row mapping 和批量操作。Application MUST决定完整 Task mutation 的事务范围，四个 Repository MUST复用同一个 SQLite connection 与同步 transaction，并 MUST共同维护一份完整有效逻辑记录。Application MUST对 domain-normalized logical record 计算不持久化的 `recordDigest`；Buildr Web mutation MUST使用该摘要作为陈旧页面前置条件。该保证 MUST NOT被描述为持久 revision、固定跨版本摘要、自动合并或多人协同编辑协议。

#### Scenario: 重复 Task ID
- **WHEN** SQLite authority 中有效 Task 已存在时再次 create
- **THEN** Buildr MUST返回 blocked 和 inspect next action
- **AND** MUST NOT覆盖、合并或重建现有记录

#### Scenario: Task 目录被其他内容占用
- **WHEN** `.buildr/tasks/<task-id>/` 不存在或只包含其他专业模块文件
- **THEN** Task Record persistence MUST忽略该目录的存在形态
- **AND** MUST NOT移动、删除、覆盖或回滚任何 Environment、Development、Review、Verification、Finish 等 sibling 文件

#### Scenario: 损坏或不支持的记录
- **WHEN** inspect 或 mutation 遇到 database corruption、不支持的 record schema、constraint violation 或关系 identity 不一致
- **THEN** Buildr MUST fail closed 并返回原始稳定诊断
- **AND** MUST NOT自动修复、删除、部分重写或从旧 YAML 恢复

#### Scenario: 替换失败
- **WHEN** 任一 Repository statement、constraint、busy timeout、validation 或 commit 失败
- **THEN** 唯一同步 transaction MUST rollback 当前 Task mutation 并保留最后一份完整有效逻辑记录
- **AND** MUST保持其他 Task 与专业 sibling records 不变

#### Scenario: Buildr Web 页面已经陈旧
- **WHEN** update、complete 或 abandon 携带的 `expectedRecordDigest` 与 transaction 内最新逻辑记录的 `recordDigest` 不一致
- **THEN** Application MUST返回 `task_record_conflict` 并提供 refresh next action
- **AND** MUST rollback、不得自动合并或用页面旧值覆盖当前记录

#### Scenario: 返回 Task Record read model
- **WHEN** Application 成功 inspect、list 或完成 mutation
- **THEN** read/result model MUST返回对应 current normalized logical record 的 `recordDigest`
- **AND** `recordDigest` MUST NOT出现在 Task Record closed schema、SQLite columns 或 Git publication 内容中

#### Scenario: 实现版本发生变化
- **WHEN** Task Record 的领域类、DTO 或 Repository 实现发生重构
- **THEN** 产品 MUST保持 `recordDigest` 对当前页面数据的版本保护语义
- **AND** MUST NOT要求重构前后相同逻辑记录产生相同摘要字节

#### Scenario: 两个客户端近同时修改同一 Task
- **WHEN** Agent/CLI 与 Buildr Web 或两个页面近同时修改同一 Task
- **THEN** SQLite transaction MUST串行化 writer，Application MUST至少拒绝已经可证明陈旧的 Buildr Web mutation
- **AND** 产品 MUST NOT声称本地 transaction 和 digest 提供远程多用户协调、租约或自动 merge

## ADDED Requirements

### Requirement: Task Record 领域与应用输入输出必须使用明确模型
Task Record Domain MUST定义 `Task`、`TaskProject`、`TaskService` 与 `TaskChange`，Application MUST使用明确输入/输出 DTO，并 MUST NOT以公开 `Record<string, unknown>` 或 `string[]` 代替已定义的领域关系对象。`TaskResult`、`TaskResultHistory`、`TaskRetrospective` 与 `ParentCompletion` MUST作为 `Task` 的内部结构，不得因没有独立持久生命周期而建立独立 Repository。

#### Scenario: Application 读取完整 Task
- **WHEN** Application 从 Persistence 读取 Task 主记录及三类关系
- **THEN** 它 MUST组装一个关系 identity 与所属 Task 一致的完整 `Task`
- **AND** 对外 MUST通过明确 DTO 返回现有 Task Record JSON 结构

#### Scenario: Application 修改 Task
- **WHEN** CLI 或 HTTP 提交明确 mutation DTO
- **THEN** Application MUST在共享事务中应用现有状态、引用、父子与结果规则
- **AND** 四个 Repository MUST只执行所属表的持久化职责
