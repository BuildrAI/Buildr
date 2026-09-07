## MODIFIED Requirements

### Requirement: 单文件写入必须保留最后一份有效记录并拒绝陈旧 Buildr Web 页面
Task Record persistence MUST只拥有 Workspace structured store 中的 `tasks`、`task_projects`、`task_services` 与 `task_changes` tables，并 MUST分别以 `TaskRepository`、`TaskProjectRepository`、`TaskServiceRepository` 与 `TaskChangeRepository` 封装各自单表 SQL、Row mapping 和批量操作。Application MUST通过Infrastructure提供的同步`TransactionManager`决定完整Task mutation范围，并 MUST在同一`TransactionContext`中直接调用四个Repository；任一Repository MUST NOT调用其他Repository或管理transaction。Application MUST对当前组装的closed Task Record DTO计算不持久化的`recordDigest`；Buildr Web mutation MUST使用该摘要作为陈旧页面前置条件。该保证 MUST NOT被描述为持久revision、固定跨版本摘要、自动合并或多人协同编辑协议。

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
- **THEN** Infrastructure TransactionManager MUST rollback 当前 Task mutation并保留最后一份完整有效逻辑记录
- **AND** MUST保持其他 Task 与专业 sibling records 不变

#### Scenario: Buildr Web 页面已经陈旧
- **WHEN** update、complete 或 abandon 携带的 `expectedRecordDigest` 与 transaction 内最新逻辑记录的 `recordDigest` 不一致
- **THEN** Application MUST返回 `task_record_conflict` 并提供 refresh next action
- **AND** MUST rollback、不得自动合并或用页面旧值覆盖当前记录

#### Scenario: 返回 Task Record read model
- **WHEN** Application 成功 inspect、list 或完成 mutation
- **THEN** read/result model MUST返回对应 current assembled Task Record DTO 的 `recordDigest`
- **AND** `recordDigest` MUST NOT出现在 Task Record closed schema、SQLite columns 或 Git publication 内容中

#### Scenario: 实现版本发生变化
- **WHEN** Task Record 的领域类、DTO 或 Repository 实现发生重构
- **THEN** 产品 MUST保持 `recordDigest` 对当前页面数据的版本保护语义
- **AND** MUST NOT要求重构前后相同逻辑记录产生相同摘要字节

#### Scenario: 两个客户端近同时修改同一 Task
- **WHEN** Agent/CLI 与 Buildr Web 或两个页面近同时修改同一 Task
- **THEN** SQLite transaction MUST串行化 writer，Application MUST至少拒绝已经可证明陈旧的 Buildr Web mutation
- **AND** 产品 MUST NOT声称本地 transaction 和 digest 提供远程多用户协调、租约或自动 merge

### Requirement: Task Record 领域与应用输入输出必须使用明确模型
Task Record Domain MUST定义只表达字段的`Task`、`TaskProject`、`TaskService`与`TaskChange`普通数据类。`TaskResult`、`TaskResultHistory`、`TaskRetrospective`与`ParentCompletion` MUST作为归属`Task`的内部类型定义在同一`task.ts`，并 MUST NOT建立独立文件或Repository。`TaskProject`、`TaskService`与`TaskChange` MUST携带所属`taskId`；Application MUST使用明确输入/输出DTO，并 MUST NOT以公开`Record<string, unknown>`或`string[]`代替已定义的数据对象。

#### Scenario: Domain 文件表达普通数据对象
- **WHEN** 架构verifier检查Task Record Domain
- **THEN** `task.ts` MUST只定义Task字段、TaskStatus以及归属Task的result/history/parentCompletion/retrospective类型
- **AND** Domain MUST NOT包含输入解析、创建/恢复方法、业务错误、normalize函数、状态变化、引用、父子、result一致性或摘要校验
- **AND** `task-result.ts`与`task-retrospective.ts` MUST不存在

#### Scenario: Application 读取完整 Task
- **WHEN** Application 从四个Repository读取Task主记录及三类关系
- **THEN** 它 MUST校验关系taskId与所属Task一致并组装现有closed Task Record输出DTO
- **AND** Domain Task MUST NOT持有HTTP `scope`或`changes`协议包装对象

#### Scenario: Application 修改 Task
- **WHEN** CLI 或 HTTP 提交明确 mutation DTO
- **THEN** Application MUST集中应用输入、状态、引用、父子、结果、复盘、历史和摘要规则
- **AND** Application MUST在共享事务中直接调用四个Repository
- **AND** Repository MUST只执行所属表的数据读取、Row/JSON转换和SQL写入
