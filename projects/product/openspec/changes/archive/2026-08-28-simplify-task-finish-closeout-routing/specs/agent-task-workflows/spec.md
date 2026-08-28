## MODIFIED Requirements

### Requirement: 内置场景化 Skills 引导产品工作流
Buildr MUST为依赖用户任务意图或工作流阶段的Buildr维护流程提供内置workspace Skills，并 MUST让Development与Finish保持相邻但独立的专业authority；Buildr MUST以同一个`task-finish` Skill解释用户的完整“收尾”或“交付”意图，再根据当前范围是否存在匹配的未结束Buildr Task选择正式Task路径或直接Git路径。

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
- **WHEN** 用户表达“收尾”或等价的当前Git交付意图，且当前范围没有匹配的未结束Buildr Task
- **THEN** Buildr MUST先路由`task-finish` Skill，再由该Skill选择`git-operations`执行直接Git交付顺序
- **AND** 该路径 MUST NOT创建临时Task、Environment、Verification、Candidate或Finish Result

#### Scenario: Agent 需要推进尚未到达 handoff 的 Task
- **WHEN** 当前范围存在唯一匹配的active Task，用户要求收尾或交付，但current Development handoff尚未形成
- **THEN** `task-finish` Skill MUST消费current `task next`并把当前动作交给selected专业owner
- **AND** owner成功后 MUST重读current facts并继续，直到handoff形成、Task终态到达或出现真实blocker
- **AND** `task-finish` Skill MUST NOT代替Development、Review、Verification或Environment写入专业Result

#### Scenario: Agent 需要完整任务收尾
- **WHEN** 用户对已有current Development handoff表达“收尾”或交付意图
- **THEN** Buildr MUST通过`task-finish` Skill消费handoff并编排carrier、integration、retained与cleanup
- **AND** Formal Finish MUST NOT编排OpenSpec、formal Verification、Review、Candidate generation或Development risk decision

#### Scenario: 无关 Task 不得劫持直接 Git 收尾
- **WHEN** Workspace只存在completed、abandoned或与当前repository set、scope和用户目标不匹配的Task
- **THEN** `task-finish` Skill MUST将当前范围视为没有匹配Task并进入直接Git分支
- **AND** MUST NOT复用这些Task的handoff、Environment、Candidate、Verification或Finish evidence
