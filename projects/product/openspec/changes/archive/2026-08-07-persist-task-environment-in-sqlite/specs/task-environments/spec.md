## MODIFIED Requirements

### Requirement: Task Environment Application 必须提供唯一确定性操作边界
Buildr MUST 由共享 Task Environment Application 实现 `prepare`、`inspect`、`resource register`、`resource release` 与 `cleanup`，并 MUST 让 CLI、Skill、Local App、Preview 和 Finish 复用该 Application，而不是复制 Environment current reader/writer 或环境判断。公共 CLI MUST 只开放 `buildr task environment prepare|inspect|cleanup <task-id>`；`prepare` MUST 幂等承担首次准备与恢复，资源登记/释放 MUST 只供已知产品 provider 内部调用。`inspect` MUST 读取 Workspace SQLite 中的 Environment current row，不得在读取时解析 `environment.json`、执行 Environment probe 或回填 lifecycle projection。

#### Scenario: Agent 准备或恢复环境
- **WHEN** Agent 运行 `buildr task environment prepare <task-id>`
- **THEN** CLI MUST 只把结构化参数交给 Application，并返回当前 `ready / blocked` 结果
- **AND** 已存在 matching Environment current row 时 MUST 从同一环境幂等恢复，不得创建第二份环境或要求单独 `restore` 命令

#### Scenario: 人或产品模块只读检查环境
- **WHEN** CLI `inspect`、Local App 或其他产品模块请求当前 Task Environment read model
- **THEN** 调用方 MUST 使用 Application `inspect` 从 `task_environment_current` 读取最近一次正式生命周期动作保存的 current 数据
- **AND** MUST NOT 直接解析 Environment Receipt 文件、Git evidence、自行形成 ready/cleanup 结论或在 GET 中补写 projection

#### Scenario: 产品模块登记持久资源
- **WHEN** Preview 或其他已登记 provider 创建/释放 Task-owned 持久资源
- **THEN** 产品模块 MUST 直接调用 Application `resource register/release`
- **AND** 根帮助、Task Environment topic help 与公共 command registry MUST NOT 暴露这两个内部 action

#### Scenario: CLI 执行 cleanup
- **WHEN** 调用方运行 `buildr task environment cleanup <task-id>`
- **THEN** Application MUST 要求并验证 Finish handoff 或明确 abandon authorization，再编排已知 providers
- **AND** CLI MUST NOT 接受任意 cleanup shell、完整 Receipt 或 caller-authored next state

### Requirement: Environment Receipt 必须是唯一环境 authority
Buildr MUST 在 Workspace SQLite 的 `task_environment_current` 中按 `task_id` 唯一维护经过 Domain 校验的 `buildr.task-environment-receipt/v2` Environment Receipt，并 MUST 由 Task Environment Application 独占写入。该 current row MUST 独占 `ready / blocked`、恢复、执行位置、执行基础、runtime projection identity、Task-owned 动态资源和 cleanup 结果；Git 或其他 provider evidence MUST NOT 竞争这些事实。`.buildr/tasks/<task-id>/environment.json` 不得再作为正常 runtime 的 authority、fallback、双写源或读取输入。

#### Scenario: 首次准备环境
- **WHEN** Task Environment 为有效正式 Task 首次执行 `prepare`
- **THEN** Buildr MUST 在任何外部环境 effect 前以事务创建最小 `task_environment_current` row
- **AND** 后续每个成功或失败步骤 MUST 更新同一 row，而不是创建第二份阶段记录

#### Scenario: Environment Receipt 与 Task Record 共存
- **WHEN** `.buildr/tasks/<task-id>/` 已包含历史 `environment.json` 或其他专业记录
- **THEN** Environment writer MUST 只更新 SQLite current row 与对应 lifecycle projection
- **AND** MUST NOT 在正常 action 中读取、更新、删除、移动或回滚任何 sibling file

#### Scenario: Receipt 进入 Git 候选
- **WHEN** Git status、初始化或 package verification 检查 Workspace 的 `.buildr/tasks/` 目录
- **THEN** 根 `.gitignore` MUST 保持 `/.buildr/tasks/` 整体排除
- **AND** Buildr MUST NOT stage、commit、push或声明 SQLite Environment current row 或历史 Environment file 为 portable owner

#### Scenario: Receipt 内容边界
- **WHEN** Environment writer 形成或更新 current row
- **THEN** receipt payload MUST 只保存恢复、真实探测、资源归属和清理所需的本机事实、identity 与最小诊断
- **AND** MUST NOT 保存 Agent session、任务计划、开发进度、完整验证结果、凭证、任意 cleanup shell、`node_modules` 内容或 runtime 生成文件副本

#### Scenario: 精确写入失败
- **WHEN** Environment 结果校验、SQLite transaction、migration 或 writer provenance 检查失败
- **THEN** Buildr MUST rollback 当前 Environment mutation 并保留最后一份有效 current row
- **AND** MUST 保留历史 `environment.json` bytes，不得用失败输入覆盖或删除它

## ADDED Requirements

### Requirement: Environment current store 必须支持一次性受控迁移
Buildr MUST 通过连续 SQLite migration 建立 `task_environment_current`，并 MUST 提供由 retained controller 执行的一次性受控 importer，将合法 v2 `environment.json` 导入对应 Task current row。导入完成后新 runtime MUST 不读取、更新、删除或双写旧文件；迁移冲突、损坏、identity 不匹配或 ownership 不明时 MUST fail closed。没有 matching Task Record 的历史文件 MUST 标记为 inert legacy，不导入、不删除且不阻塞其他合法 Task 的导入。

#### Scenario: 合法旧 receipt 导入
- **WHEN** 旧 `environment.json` 是普通文件，Task Record 存在，receipt schema、Task ID 和 Workspace root 全部匹配
- **THEN** importer MUST 在单一 SQLite transaction 中写入 normalized current row并记录 migration effect
- **AND** 后续 `inspect`、`prepare`、resource action 与 `cleanup` MUST 只使用 SQLite current row

#### Scenario: 旧 receipt 导入冲突
- **WHEN** 旧文件不是普通文件、JSON/schema 无效或 identity/ownership 无法证明
- **THEN** importer MUST 保留原文件与已有 SQLite 数据并返回稳定 blocked diagnostic
- **AND** MUST NOT 删除、覆盖、双写或让旧文件继续作为正常 runtime fallback

#### Scenario: 孤立旧 receipt 保持 inert
- **WHEN** 旧文件没有 matching Task Record
- **THEN** importer MUST 将其标记为 inert legacy，不导入或删除，也不得阻塞其他合法 Task 的导入

#### Scenario: Candidate importer 与 retained store
- **WHEN** candidate runtime 在 Task Validation Workspace 验证 importer 或 migration
- **THEN** candidate MUST 只写自己的 validation store
- **AND** MUST NOT 导入、修改或删除 retained canonical Workspace 的 Environment current row 或历史文件
