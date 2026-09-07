## ADDED Requirements

### Requirement: 内置场景化 Skills 必须围绕真实产物协作
Buildr内置Task与OpenSpec Skills MUST让Agent依据目标和真实现场按需选择Task Record、Environment、Current Knowledge、Review、Verification、Git与默认task-finish能力，不得路由已退役工作流。

#### Scenario: 普通实现达到可交付状态
- **WHEN** Agent已完成实现并取得任务所需的实际检查结果
- **THEN** Agent MUST可直接进入适用的审查、验证或交付动作
- **AND** MUST不创建Task Candidate、generation或Development Handoff

### Requirement: 内置任务 Skills 只依赖实际需要的能力契约
Task Triage MAY按需消费Task Record、Git、Current Knowledge和Environment；task-finish MAY调用Task Record、Git和Environment cleanup。Capability graph MUST不包含已退役Task Development provider或binding。

#### Scenario: 解析任务能力图
- **WHEN** package或runtime解析内置任务Skills
- **THEN** 每个consumer MUST只因实际动作需要而声明依赖
- **AND** optional专业结果缺失 MUST不扩大为全局阻塞

### Requirement: OpenSpec workflow 必须直接组合当前认知维护
OpenSpec propose、update、apply、sync与archive contributions MUST按真实知识影响调用Current Knowledge provider；Current Knowledge结果直接交给Agent解释，不经研发聚合模块转发。

#### Scenario: Change实现改变当前知识
- **WHEN** Agent完成实现并准备收敛Change
- **THEN** Agent MUST按impact完成reconcile并重新观察交付内容
- **AND** OpenSpec convergence MUST不依赖任务研发回执

### Requirement: Task Environment 只保护实际环境动作
正式Task需要受管执行根、运行时、资源或清理时，Agent MUST使用matching Task Environment；不需要这些能力的安全工作 MUST不因Environment缺失而停止。

#### Scenario: 任务需要隔离检出
- **WHEN** Agent将修改写入受管Task worktree
- **THEN** Agent MUST使用Environment返回的实际执行根和controller
- **AND** Environment MUST不决定研发、审查、验证或交付顺序

### Requirement: Task Review 与 Task Verification 必须保持独立
Review与Verification MUST分别记录真实审查和验证结果。Agent MUST依据目标、当前对象和风险判断是否调用及如何消费；Application MUST不生成统一推进决定。

#### Scenario: 内容在检查后变化
- **WHEN** 已审查或验证对象的真实identity发生变化
- **THEN** Agent MUST只重做受影响的检查
- **AND** MUST不建立统一stale状态或候选代次

### Requirement: OpenSpec Change checklist 必须止于 Change disposition
Buildr-owned OpenSpec contributions MUST只把归档前可完成的实现、知识收敛、验证反馈和convergence readiness写入`tasks.md`。交付、Task terminal transition与Environment cleanup由Agent在Change外按实际需要完成。

#### Scenario: Change checklist全部完成
- **WHEN** Change已满足convergence和archive条件
- **THEN** checklist MUST允许Change归档
- **AND** MUST不要求Task Candidate、Development Handoff或旧Finish运行

### Requirement: 受管内部入口必须只覆盖仍存在的专业能力
受管Skills调用Task Retrospective等仍存在的内部能力时 MUST使用matching retained controller。Runtime和文档 MUST不发现Task Development或Task Planning Identity route。

#### Scenario: 从Task worktree记录复盘
- **WHEN** Agent需要调用Task Retrospective内部入口
- **THEN** MUST使用Environment或Workspace解析的retained controller
- **AND** MUST不恢复任何已退役内部route

## REMOVED Requirements

### Requirement: 内置场景化 Skills 引导产品工作流
**Reason**: 仍正向路由Task Development。
**Migration**: 由“内置场景化 Skills 必须围绕真实产物协作”替代。

### Requirement: 内置任务 Skills 只按 current capability contract 协作
**Reason**: 仍声明已退役provider和binding。
**Migration**: 由新的最小能力依赖Requirement替代。

### Requirement: OpenSpec workflow 必须通过能力契约组合当前认知维护
**Reason**: 仍把Current Knowledge交给Task Development消费。
**Migration**: OpenSpec与Agent直接消费专业结果。

### Requirement: 正式持久交付必须经过 Task Environment ready 门槛
**Reason**: 把环境与研发顺序绑定。
**Migration**: Environment只保护实际环境动作。

### Requirement: 任务 Skills 必须消费新的 Environment capability topology
**Reason**: 仍正向声明Task Development consumer。
**Migration**: 由新的Environment局部职责Requirement替代。

### Requirement: P0.3 不得把两种 Review 变成默认 Task 门禁
**Reason**: 包含未来Task Development gate授权。
**Migration**: Review保持独立可选结果。

### Requirement: task-verification Skill 必须作为语义验证入口
**Reason**: 场景仍要求Development提供Content Target与policy。
**Migration**: Verification直接使用当前Task和真实内容identity。

### Requirement: P0.4 workflow 不得抢占 Development 或其他专业 authority
**Reason**: 把是否继续的唯一判断交给已退役模块。
**Migration**: Agent解释独立Verification结果。

### Requirement: OpenSpec Change checklist 必须止于 Change disposition 边界
**Reason**: 仍把归档后动作交给Task Development lifecycle。
**Migration**: 由当前Change disposition Requirement替代。

### Requirement: 日常任务效率指标必须保持非门禁
**Reason**: 使用已退役gate、Candidate和handoff作为指标边界。
**Migration**: Task Retrospective独立记录Agent执行效率，不影响专业结果或Task状态。

### Requirement: 受管正式工作流必须通过 retained controller 调用内部入口
**Reason**: 仍列出已删除内部routes。
**Migration**: 只保留实际存在的Retrospective等入口。

### Requirement: Agent 必须消费正式任务入口的同源引导
**Reason**: 仍要求task-development消费typed next。
**Migration**: Agent直接消费Task和专业Skill引导。

### Requirement: 智能体必须使用轻量父子管理方法
**Reason**: 消费者清单仍包含已删除Skill。
**Migration**: Parent Coordination与task-manager直接维护父子事实。
