## MODIFIED Requirements

### Requirement: 内置场景化 Skills 引导产品工作流
Buildr MUST为依赖用户任务意图或工作流阶段的Buildr维护流程提供内置workspace Skills，并 MUST让Development与Finish保持相邻但独立的语义入口；Buildr MUST 将已有 formal Task 的正式收尾与无 active Task 的直接 Git 收尾保持为两个独立入口。

#### Scenario: Agent 需要任务分流指引
- **WHEN** 用户要求修bug、实现或调整功能、改需求、重构、优化、补文档、补测试、调整API、契约、权限、状态流、数据语义，或询问某项改动是否需要spec/change管理
- **THEN** Buildr MUST通过内置Skill提供任务意图分流能力
- **AND** 该Skill MUST帮助Agent先理解意图和影响范围，再选择后续处理方式

#### Scenario: Agent 需要 OpenSpec 工作流指引
- **WHEN** Agent需要探索、提案、实现、同步或归档OpenSpec Change
- **THEN** Buildr MUST依赖可用的`openspec-*` Skills匹配该意图
- **AND** Buildr MUST NOT要求Agent读取optional OpenSpec Rule来执行该工作流

#### Scenario: Agent 需要代码开发工作流指引
- **WHEN** 用户要求代码开发、构建、测试、多仓协作、隔离任务分支或长期任务上下文
- **THEN** Buildr MUST通过Task Environment及适用实现Skill提供执行边界
- **AND** 内容稳定后 MUST路由`task-development`完成Verification、Candidate、Completion Review与handoff

#### Scenario: Agent 需要 Git 操作指引
- **WHEN** 用户已经选择独立 commit、push、commit+push 或其他明确 Git Operation，或上游 consumer 已提供该动作
- **THEN** Buildr MUST通过唯一 `git-operations` Skill消费 `buildr.git-operations/v1`
- **AND** Git Operations MUST NOT自行扩展动作目录、选择交付顺序、接管Development Candidate或完整Task Finish

#### Scenario: Agent 在无 active Task 时需要直接收尾
- **WHEN** Workspace 没有 active Task，用户表达“收尾”或等价的当前 Git 交付意图，且当前 Git facts 能唯一解析 repository、目标 ref、owned scope 和 push destination
- **THEN** Buildr MUST 将该意图路由到 `git-operations`，由产品入口选择直接 Git 交付顺序
- **AND** 该路径 MUST NOT 创建临时 Task、Environment、Verification、Candidate 或 Finish Result

#### Scenario: Agent 需要完整任务收尾
- **WHEN** 用户对已有current Development handoff表达“收尾”或交付意图
- **THEN** Buildr MUST通过独立Task Finish Skill消费handoff并编排carrier、integration、retained与cleanup
- **AND** Finish MUST NOT编排OpenSpec、formal Verification、Review、Candidate generation或Development risk decision
