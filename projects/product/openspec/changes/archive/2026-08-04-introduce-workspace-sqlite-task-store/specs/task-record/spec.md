## MODIFIED Requirements

### Requirement: Task Record 必须拥有 canonical Workspace 路径
Buildr MUST 为每个正式 Task 在明确的 canonical Workspace 的唯一 Workspace structured store 中维护一条 canonical Task Record，并 MUST 让命令参数和记录内 `taskId` 完全一致。Task Record MUST NOT保存数据库 path、row id、Workspace identity 或 Task Environment identity；`.buildr/tasks/<task-id>/task.yml` MUST NOT再作为 Task Record authority、fallback 或兼容输入。

#### Scenario: 在 canonical Workspace 创建记录
- **WHEN** 调用方以已初始化的 canonical Workspace 为 target 创建合法 Task ID
- **THEN** Buildr MUST 在 `.buildr/local/workspace.sqlite` 的 Task-owned tables 中事务化创建记录
- **AND** MUST NOT在记录中复制 `workspaceId`、database path、row id、checkout path 或 environment receipt

#### Scenario: 从 task environment 发起调用
- **WHEN** 调用方当前位于 task environment 但需要维护 Task Record
- **THEN** 调用方 MUST 显式传入已由上游确认的 canonical Workspace target
- **AND** Task Record Application MUST NOT读取 environment receipt、推断 worktree 与 retained root 关系或保存任何环境字段

#### Scenario: target 不是 canonical Workspace
- **WHEN** target 未初始化、指向 task worktree 副本、存在多个无法消歧的 Workspace root 或目标路径逃逸
- **THEN** Buildr MUST 在打开或写入数据库前返回 blocked
- **AND** MUST 保持候选 Task Record、Workspace database 与其他 Workspace 文件不变

#### Scenario: 判断 Git Workspace authority
- **WHEN** 已初始化 Workspace 同时位于 Git repository 中
- **THEN** Buildr MUST 根据真实 `git-dir` 与 `git-common-dir` 拓扑判断 target 是否为 linked worktree checkout
- **AND** MUST NOT仅根据路径是否包含 `.worktrees` 或 `.git` 是文件/目录判断 authority；非 Git Workspace MUST继续可用

#### Scenario: 跨 Agent 恢复
- **WHEN** Agent 更换 session、runtime 或 task worktree 后，以相同 canonical Workspace 和 Task ID inspect
- **THEN** Buildr MUST 从同一 Workspace structured store 返回同一份逻辑 Task Record
- **AND** MUST NOT依赖原 session、原 worktree或机器临时进程仍然存在

#### Scenario: 旧文件记录存在
- **WHEN** Workspace 仍包含一个或多个 `.buildr/tasks/<task-id>/task.yml`
- **THEN** Task Application MUST不扫描、读取、导入、删除或双写这些文件
- **AND** inspect/list MUST只返回 SQLite authority 中真实存在的 Task

### Requirement: Task Record mutation 必须由产品动作完成
Buildr MUST 通过 `create`、`inspect`、`update`、`complete` 和 `abandon` 五个明确 Task Record Application action 管理 Task Record。`task-manager` Skill/CLI 与 Local App MUST只作为该 Application 的客户端；Agent、HTTP interface 和 Web feature MUST NOT直接编辑数据库、提交完整 next-state document 或自行生成系统字段。

#### Scenario: 创建 Task
- **WHEN** `create` 收到合法且尚不存在的 Task ID、title、intent 与可选 scope/reference flags
- **THEN** Application MUST生成 active Task Record 和 `createdAt/updatedAt`
- **AND** repository MUST在同一 transaction 写入 Task 主记录和全部 scope/reference relations

#### Scenario: 更新 active Task
- **WHEN** `update` 收到至少一个明确的 title/intent setter 或 scope/change add/remove flag，且当前状态为 active
- **THEN** Application MUST在 write transaction 内读取最新记录、应用明确操作、重新验证完整记录并更新 `updatedAt`
- **AND** omitted 字段 MUST保持不变，重复 add 或不存在的 remove MUST返回稳定结果而不得猜测

#### Scenario: inspect Task
- **WHEN** `inspect` 读取有效 Task ID
- **THEN** Application MUST只读返回当前完整逻辑记录和 response-level digest
- **AND** MUST NOT创建数据库、更新时间、状态、结果或任何业务字段

#### Scenario: mutation 输入不明确
- **WHEN** `update` 没有任何 mutation flag、同一字段同时 add/remove、或调用方试图通过未登记参数改变系统字段
- **THEN** CLI/Application MUST拒绝操作并返回对应 help/diagnostic
- **AND** Task Record transaction MUST rollback 或保持零写入

#### Scenario: 两个客户端执行同一动作
- **WHEN** Agent 通过 `task-manager`/CLI 或人通过 Local App 创建、更新或结束 Task
- **THEN** 两个入口 MUST调用相同 Application action、validator、reference resolver 与 repository
- **AND** 任一客户端 MUST NOT维护第二套状态转换、默认值、SQL、schema migration 或 database writer

### Requirement: 单文件写入必须保留最后一份有效记录并拒绝陈旧页面
Task Record repository MUST只拥有 Workspace structured store 中的 `tasks`、`task_projects`、`task_services` 与 `task_changes` tables，并 MUST在单一 SQLite transaction 内维护一份完整有效逻辑记录。Application MUST对 domain-normalized logical record 计算不持久化的 `recordDigest`；Local App mutation MUST使用该摘要作为陈旧页面前置条件。该保证 MUST NOT被描述为持久 revision、自动合并或多人协同编辑协议。

#### Scenario: 重复 Task ID
- **WHEN** SQLite authority 中有效 Task 已存在时再次 create
- **THEN** Buildr MUST返回 blocked 和 inspect next action
- **AND** MUST NOT覆盖、合并或重建现有记录

#### Scenario: Task 目录被其他内容占用
- **WHEN** `.buildr/tasks/<task-id>/` 不存在或只包含其他专业模块文件
- **THEN** Task Record repository MUST忽略该目录的存在形态
- **AND** MUST NOT移动、删除、覆盖或回滚任何 Environment、Development、Review、Verification、Finish 等 sibling 文件

#### Scenario: 损坏或不支持的记录
- **WHEN** inspect 或 mutation 遇到 database corruption、不支持的 record schema、constraint violation 或关系 identity 不一致
- **THEN** Buildr MUST fail closed 并返回原始稳定诊断
- **AND** MUST NOT自动修复、删除、部分重写或从旧 YAML 恢复

#### Scenario: 替换失败
- **WHEN** statement、constraint、busy timeout、validation 或 commit 失败
- **THEN** Buildr MUST rollback 当前 Task mutation 并保留最后一份完整有效逻辑记录
- **AND** MUST保持其他 Task 与专业 sibling records 不变

#### Scenario: Local App 页面已经陈旧
- **WHEN** update、complete 或 abandon 携带的 `expectedRecordDigest` 与 transaction 内最新逻辑记录的 `recordDigest` 不一致
- **THEN** Application MUST返回 `task_record_conflict` 并提供 refresh next action
- **AND** MUST rollback、不得自动合并或用页面旧值覆盖当前记录

#### Scenario: 返回 Task Record read model
- **WHEN** Application 成功 inspect、list 或完成 mutation
- **THEN** read/result model MUST返回对应 current normalized logical record 的 `recordDigest`
- **AND** `recordDigest` MUST NOT出现在 Task Record closed schema、SQLite columns 或 Git publication 内容中

#### Scenario: 两个客户端近同时修改同一 Task
- **WHEN** Agent/CLI 与 Local App 或两个页面近同时修改同一 Task
- **THEN** SQLite transaction MUST串行化 writer，Application MUST至少拒绝已经可证明陈旧的 Local App mutation
- **AND** 产品 MUST NOT声称本地 transaction 和 digest 提供远程多用户协调、租约或自动 merge

## REMOVED Requirements

### Requirement: Task Record writer 必须声明 portable publication path
**Reason**: Task Record authority 已切换到 local-only Workspace Structured Store，不再存在 portable Task Record path。
**Migration**: 旧 `task.yml` 保持 inert；Task Metadata Publication 从 writer declarations 中移除该路径，Task 通过产品动作按需重新创建。

## ADDED Requirements

### Requirement: Task Record writer 必须声明 local-only structured persistence
Task Record writer MUST声明 `buildr.task-record/v1` 的 persistence classification 为 Workspace-local structured data，并 MUST返回空 portable publication path 集合。声明 MUST NOT暴露数据库 path、table、row id、SQL、`recordDigest` 或扩大到其他 lifecycle owner。

#### Scenario: Metadata Publication 请求 local-only Task Record ownership
- **WHEN** `task-metadata-publication` 为一个合法 Task ID 组合 writer declarations
- **THEN** Task Record writer declaration MUST返回空 portable path 集合并标记 local-only
- **AND** MUST NOT包含 `.buildr/local/workspace.sqlite*`、旧 `task.yml`、Environment、Development、Review、Verification 或 Finish 路径

#### Scenario: 历史引用当前不可用
- **WHEN** 有效 Task Record 包含 archived、retired 或当前 unavailable 的 Project/Service/Change 引用
- **THEN** Task Record read model MUST保留逻辑 record 并返回 availability diagnostic
- **AND** publication MUST NOT要求 writer 导出或改写 Task Record 才能处理其他 portable records
