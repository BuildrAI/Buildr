## MODIFIED Requirements

### Requirement: Environment Receipt 必须是唯一环境 authority
Buildr MUST 在 `<canonical-workspace>/.buildr/tasks/<task-id>/environment.json` 维护唯一 `buildr.task-environment-receipt/v2` Environment Receipt，并 MUST 由 Task Environment Application 独占写入。Receipt MUST 独占 `ready / blocked`、恢复、执行位置、执行基础、runtime projection identity、Task-owned 动态资源和 cleanup 结果；Git 或其他 provider evidence MUST NOT 竞争这些事实。

#### Scenario: 首次准备环境
- **WHEN** Task Environment 为有效正式 Task 首次执行 `prepare`
- **THEN** Buildr MUST 在任何外部环境 effect 前创建最小 Environment Receipt
- **AND** 后续每个成功或失败步骤 MUST 更新同一份 receipt，而不是创建第二份阶段记录

#### Scenario: Environment Receipt 与 Task Record 共存
- **WHEN** `.buildr/tasks/<task-id>/` 已包含 `task.yml` 或其他专业记录
- **THEN** Environment writer MUST 只创建或替换 `environment.json`
- **AND** MUST NOT 读取后回填、删除、移动或回滚 sibling 文件

#### Scenario: Receipt 进入 Git 候选
- **WHEN** Git status、初始化或 package verification 检查 Workspace 的 `.buildr/tasks/` 目录
- **THEN** 根 `.gitignore` MUST 包含 `/.buildr/tasks/` 并整体排除该目录
- **AND** Buildr MUST NOT stage、commit、push或声明其中任一 Environment Receipt 或 inert legacy record 为 portable owner

#### Scenario: Receipt 内容边界
- **WHEN** Environment writer 形成或更新 receipt
- **THEN** receipt MUST 只保存恢复、真实探测、资源归属和清理所需的本机事实、identity 与最小诊断
- **AND** MUST NOT 保存 Agent session、任务计划、开发进度、完整验证结果、凭证、任意 cleanup shell、`node_modules` 内容或 runtime 生成文件副本

#### Scenario: 精确写入失败
- **WHEN** 环境结果校验、临时写入或同目录原子替换失败
- **THEN** Buildr MUST 保留原 `environment.json` bytes 与全部 sibling 文件
- **AND** MUST 只清理可证明属于本次失败写入的临时文件
