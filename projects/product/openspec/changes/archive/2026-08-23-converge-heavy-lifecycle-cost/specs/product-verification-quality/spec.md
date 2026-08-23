## ADDED Requirements

### Requirement: Buildr Test Context 必须以 runner-independent Pool 管理不可变 seed
Buildr Product MUST 在 test-only 边界提供 runner-independent 的 Test Context contract与Pool；每个Context MUST由稳定key和唯一provider拥有，Pool MUST在同一verification plan中最多prepare一次不可变seed，并 MUST通过独立sandbox lease向worker或test case交付可写状态。Product runtime、Project verification declaration和npm package MUST NOT包含该test-only Context policy。

#### Scenario: 多个 owner 使用同一 Context
- **WHEN** 一个 verification plan中的多个step声明相同Context key
- **THEN** outer runner MUST最多prepare一次matching seed
- **AND** 各step/worker MUST只消费同一seed identity派生的独立sandbox

#### Scenario: 直接运行单个测试文件
- **WHEN** 维护者绕过outer runner直接运行已登记Context的测试文件
- **THEN** worker-local Pool MUST在当前进程内最多prepare一次等价Context
- **AND** 进程结束时 MUST清理自身拥有的seed与sandbox

#### Scenario: Context identity或边界被污染
- **WHEN** marker、provider、realpath containment、seed content identity或sandbox isolation不匹配
- **THEN** acquire或release MUST fail closed并输出稳定context diagnostic
- **AND** runner MUST NOT静默重建基线后把原执行记录为passed

### Requirement: Context provider 必须按真实副作用声明隔离与重置策略
每个 Buildr Test Context provider MUST声明footprints、isolation mode、reset strategy和parallel safety；SQLite、Git、Workspace、process与CLI MUST按真实跨越的技术边界选择隔离，且Context共享 MUST NOT改变测试的Unit、Component、Integration或System分类。

#### Scenario: 同进程 Task Application case
- **WHEN** 待证明事实可以在有界Task Domain/Application组装中充分判断且Git、CLI、Workspace不是主要证据
- **THEN** 测试 MUST使用Component边界和fake/in-memory外部port
- **AND** 真实adapter contract MUST由独立Integration owner证明

#### Scenario: SQLite多进程或Git Workspace case
- **WHEN** 测试跨多个SQLite连接/子进程或修改Git index、refs、worktree与Workspace文件
- **THEN** 每个并行case MUST使用独立database snapshot或sandbox
- **AND** MUST NOT依赖共享transaction回滚恢复其他进程或Git/filesystem状态

#### Scenario: 黄金生命周期
- **WHEN** 初始化、迁移、Task Environment、Worktree、Finish、自举、cleanup或并发Acceptance本身是主要待证明事实
- **THEN** primary owner MUST保留完整真实生命周期和独立环境
- **AND** 预建Context MUST NOT跳过该事实边界

### Requirement: Verification scheduler 必须向inner runner下发层级资源grant
Buildr Product verification registry MUST声明step的Context profile、并行安全性和数值resource demand；outer scheduler MUST同时遵守global、class、跨plan lease与plan内数值capacity，并 MUST把实际worker grant下发给executor。inner runner MUST NOT在grant之外自行扩大并发。

#### Scenario: 多个重型step同时ready
- **WHEN** ready steps的CPU worker、process、Git或Workspace I/O需求总和超过execution profile capacity
- **THEN** scheduler MUST只启动可完整满足grant的step并让其余step保持queued
- **AND** timing evidence MUST记录demand、grant、queue duration和适用的cross-plan resource wait

#### Scenario: inner node test worker启动
- **WHEN** step使用`node:test`或领域suite runner启动多个worker
- **THEN** executor MUST从outer grant导出唯一worker budget
- **AND** step静态参数、环境或内部fallback MUST NOT把并发提高到grant以上

#### Scenario: 非法Context或resource声明
- **WHEN** registry引用未知Context、非法隔离/reset值、非正整数demand或超出profile总capacity的不可满足step
- **THEN** planner MUST在启动测试进程前fail closed
- **AND** 诊断 MUST标识step、字段、需求与限制capacity

### Requirement: Task验证必须按最低充分边界迁移且保持唯一主证据
Buildr Product MUST以Task领域作为Test Context首个迁移样板，分别维护Task Component、SQLite Integration、CLI/Git Integration和System黄金旅程；迁移 MUST先证明公共可观察结果与primary evidence owner转移，再移除重复的重型准备或happy path。

#### Scenario: Task领域规则不需要真实外部边界
- **WHEN** Task Record、Development、Review或Verification规则可由同进程Application结果和状态转换充分证明
- **THEN** primary development test MUST使用Component context并允许高并发
- **AND** 该case MUST NOT重复启动CLI、Git repository或完整Workspace

#### Scenario: 迁移后执行Core和Candidate
- **WHEN** Task owner边界或fixture发生迁移
- **THEN** contract verification MUST证明Core与Candidate的文件union、唯一primary owner及Release exclusions没有coverage loss或重复
- **AND** 完整Finish、自举和concurrent-task-acceptance黄金旅程 MUST继续存在

### Requirement: Test Context与验证成本优化必须形成可复核证据和架构文档
Buildr Product MUST用同一tree的纯Core基线、focused多轮、Core多轮和至少一次Core/affected竞争压力评估Test Context与层级并发；同时 MUST维护一份与当前registry和实现一致的完整验证框架文档。单次性能波动 MUST NOT改变正确性结果或成为删除主证据的理由。

#### Scenario: 验收Context优化
- **WHEN** Test Context、owner边界或层级资源模型完成实现
- **THEN** evidence MUST分别记录context prepare、sandbox materialize、test body、cleanup、step queue与resource wait
- **AND** 报告 MUST说明纯Core wall-clock中位数、累计executor work、波动、残余长尾与Candidate/Release coverage结果

#### Scenario: 核心Full仍无法达到目标
- **WHEN** 多轮干净且无外部竞争的纯Core证明必要owner集合仍无法满足Parent目标
- **THEN** Child MUST保留真实计时和可证明下限并明确residual
- **AND** MUST NOT通过删减无替代primary evidence或保留不可能预算声称目标已完成

#### Scenario: 维护者阅读验证框架
- **WHEN** 维护者需要新增、选择、运行或优化Buildr测试
- **THEN** 文档 MUST说明控制面、执行面、测试边界、Context生命周期、并发/资源、证据owner、Core/Candidate/Release与接入流程
- **AND** 文档中的目录、字段、入口与示例 MUST能由当前代码和registry核对
