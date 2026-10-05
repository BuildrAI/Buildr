## MODIFIED Requirements

### Requirement: task-triage 必须条件消费 Task Record capability
Buildr package MUST 为 task-triage 提供 optional `buildr.task-record@4` consumer edge。todo 创建分支 MUST 只调用 Task Record provider；active 创建或 todo 激活分支 MUST 核对目标、范围、授权和适用记录版本后调用已选任务记录提供者（Provider），登记 MUST 不依赖 Git 基线、工作树（Worktree）或全局就绪；后续 Git 与专业动作按实际目标分别选择。

#### Scenario: 检查 capability graph
- **WHEN** package verification 检查当前 capability graph
- **THEN** graph MUST 包含 `buildr.task-record@4`、default task-manager provider/binding 和 task-triage optional consumer edge
- **AND** MUST NOT给专业阶段增加 Task Record consumer edge

#### Scenario: todo data-only 分支
- **WHEN** 用户只接受未启动意向
- **THEN** task-triage MUST 创建 todo Task 而不消费 Git Operations
- **AND** MUST 不创建 Environment、Change 或专业 placeholder

#### Scenario: 正式分支 provider 不 ready
- **WHEN** active 创建或 todo 激活的记录目标、范围、授权、版本或已选任务记录提供者（Provider）无法确认
- **THEN** MUST 只停止对应记录写入并报告具体原因与下一动作，其他独立安全工作保持可执行
- **AND** todo MUST 保持原状态且语义分流结果可见

#### Scenario: 旧专业模块继续运行
- **WHEN** active Task 调用 worktree、Verification、Task Finish 或其他专业路径
- **THEN** 它们 MUST 继续只维护自己的专业 receipt/result/store
- **AND** MUST NOT 自动回填专业字段到 Task Record

#### Scenario: 非 Git 工作空间开始正式任务
- **WHEN** 已初始化的非 Git 工作空间（Workspace）中，用户授权明确的资料任务且记录提供者可用
- **THEN** task-triage MUST 可以创建或激活正式任务，不先创建仓库、工作树或 Git 基线
- **AND** 后续文件修改 MUST 另按真实对象归属与专业写入边界执行，登记不能代替资料验收
