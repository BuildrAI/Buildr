## ADDED Requirements

### Requirement: Task Verification必须维护一份独立完成报告
Buildr MUST为每个正式Task维护至多一份current `buildr.task-verification-report/v1`。报告MUST绑定Task ID、Task scope、内容版本、当前Project测试地图identities、实际checks、gaps、整体结论和完成时间；MUST NOT绑定Candidate、generation、lease、Development policy、gate、decision、handoff或Task完成状态。

#### Scenario: Agent保存开发完成后的报告
- **WHEN** Agent完成任务相关测试与适用低成本完整回归，并提交包含实际checks或明确gaps的完整报告
- **THEN** Application MUST校验Task、scope、内容版本、测试地图和closed report shape后原子替换current报告
- **AND** MUST返回保存结果而不是测试进程运行结果

#### Scenario: 开发过程中的临时测试
- **WHEN** Agent只是在开发过程中运行focused测试或修复反馈
- **THEN** Agent MUST NOT写Task Verification Report
- **AND** Application MUST不提供逐次run、attempt或history记录入口

### Requirement: 任务验证报告必须有意义且保持closed
报告MUST至少包含一个实际check或gap。每个check MUST说明Project、可选Service、testing family、`focus|task-related|full`选择范围、实际targets、source、`passed|failed`结果、摘要和可选耗时；每个gap MUST说明未覆盖scope/testing及原因。Application MUST为每个check派生`declared|map-unavailable`地图状态，caller MUST NOT自行声明该状态。

`passed` MUST至少包含一个实际check且所有check均为passed；`not-passed` MUST至少包含一个failed check；`incomplete` MUST不包含failed check且至少包含一个gap。gap MAY与passed共存，但不能单独证明passed。

#### Scenario: 只有测试通过一句话
- **WHEN** caller提交没有checks和gaps的报告，或提交未知字段、绝对路径、非法outcome或矛盾passed结论
- **THEN** Application MUST拒绝整个报告
- **AND** 原current报告MUST保持不变

#### Scenario: 环境冒烟不适用
- **WHEN** Agent完成任务相关测试，但当前尚未进入测试环境
- **THEN** 报告MUST允许以gap记录environment-smoke未执行及原因
- **AND** Application MUST NOT自动把gap解释为Task blocked、风险接受或完成授权

#### Scenario: 只有gap却声明passed
- **WHEN** caller没有提交实际check，只提交gap并声明passed
- **THEN** Application MUST拒绝整个报告
- **AND** 原current报告MUST保持不变

#### Scenario: 结论与实际检查不一致
- **WHEN** caller声明not-passed但没有failed check，或声明incomplete却存在failed check或没有gap
- **THEN** Application MUST拒绝整个报告
- **AND** MUST不替caller猜测另一种结论

### Requirement: Application必须把实际检查绑定到Task范围与Project测试地图
Application MUST使用current Task scope和本次观察到的Project测试地图校验每个check，而不是信任caller重复声明关系。check Project MUST属于Task有效Project范围；可选Service MUST属于Task允许的Service范围；测试地图可用时，testing family MUST存在且其Project/Service scope MUST覆盖该check。任一可用地图绑定错误MUST拒绝整份报告。

#### Scenario: check引用Task范围外对象
- **WHEN** caller提交Task范围外Project或Service的check
- **THEN** Application MUST以scope mismatch拒绝整份报告
- **AND** MUST不保存部分checks

#### Scenario: 可用地图中不存在testing family
- **WHEN** Project测试地图可用但check引用不存在或不覆盖该Service的testing family
- **THEN** Application MUST拒绝整份报告
- **AND** MUST不把caller文本当成测试地图事实

### Requirement: 测试地图缺失或损坏不得否定真实验证事实
Project测试地图不存在、无法解析或schema校验失败时，Task Verification record/inspect MUST仍可保存和读取caller实际完成的checks。Application MUST记录本次观察到的地图identity与`absent|invalid`状态，把相关check标记为`map-unavailable`，并追加明确gap；MUST NOT把该check描述为已由地图声明。Project Verification的维护接口仍MUST独立报告地图无效。

#### Scenario: Agent已完成测试但verification.yml损坏
- **WHEN** caller提交Task范围内的真实check，而对应Project测试地图无法解析或校验失败
- **THEN** Application MUST保存真实check并派生`map-unavailable`
- **AND** MUST追加地图无效gap及可移植诊断摘要
- **AND** MUST NOT因局部地图缺陷拒绝整份报告

#### Scenario: Project没有verification.yml
- **WHEN** caller提交Task范围内的真实check，而Project尚无测试地图
- **THEN** Application MUST记录`absent`地图状态、`map-unavailable` check和地图缺失gap
- **AND** MUST NOT伪造testing family已经登记

### Requirement: Task Verification Application只提供record与inspect
Task Verification MUST只提供`record`和`inspect` Application能力。`record`负责校验并保存整值报告；`inspect`负责读取报告，并根据调用方提供的current内容版本与当前测试地图identities派生`current|stale|unknown`。只有调用方提供current内容identity时，Application才能判断内容`current|stale`；未提供时内容与整体适用性MUST为unknown，且不得引入新的内容版本服务。Application MUST NOT生成Plan、选择测试、执行命令、读取Execution Record、reconcile、cleanup、GC或恢复unknown outcome。

#### Scenario: 内容或测试地图变化
- **WHEN** current内容版本或任一Project测试地图identity与报告保存值不同
- **THEN** `inspect` MUST返回stale及精确原因
- **AND** MUST NOT改写、删除或自动重跑旧报告

#### Scenario: 调用方未提供current内容identity
- **WHEN** caller只读取Task当前验证报告而未提供current内容identity
- **THEN** `inspect` MUST返回内容适用性unknown
- **AND** MUST仍返回保存的报告和测试地图比较结果

#### Scenario: Agent请求验证指引
- **WHEN** Agent请求Task Verification prompt
- **THEN** prompt MUST指导Agent读取Task、改动、测试地图、测试目录、脚本、CI和说明后直接调用现有工具
- **AND** MUST明确开发完成后才调用`record`

### Requirement: Task Verification不得拥有Task推进或其他专业authority
Task Verification MUST NOT创建或消费Task Candidate、generation、Development policy、proceed/blocked、风险授权、Completion Review、Task Finish或Task顶层状态。其他Application MUST NOT把Task Verification报告设为自身写入、Candidate或handoff的结构性前置。

#### Scenario: 报告包含失败或gap
- **WHEN** current报告结论为`not-passed|incomplete`或包含gap
- **THEN** Task Verification MUST只保存并展示该事实
- **AND** Agent MUST修复实际问题或向用户报告，其他owner不得回写风险决定到报告

### Requirement: Task Verification专属Execution Record必须退出
Buildr MUST NOT为新的Task Verification创建`task-verification/verification-execution` record、正文、quota、retention、recovery、cleanup或GC入口。项目runner MAY维护自身日志、DAG和资源协调，但这些实现MUST NOT成为通用Task Verification产品模块。

#### Scenario: Agent直接运行项目测试
- **WHEN** Agent调用Maven、npm、Playwright、Browser、HTTP或项目runner
- **THEN** Buildr Task Verification MUST不打开Execution Record或分配资源lease
- **AND** Agent MUST只把有意义摘要写入最终报告

## REMOVED Requirements

### Requirement: Task Verification 必须维护一个 Task-scoped current Result
**Reason**: Result v2的Candidate与Execution Record绑定被独立完成报告取代。
**Migration**: 迁移可确定的current事实到`buildr.task-verification-report/v1`。

### Requirement: Result 必须使用关闭且最小的数据模型
**Reason**: 旧Result数据模型被新报告schema取代。
**Migration**: 使用checks、gaps和三态conclusion。

### Requirement: Result 必须原子整值替换且失败时保留 current
**Reason**: 旧Result写入契约退出。
**Migration**: 新报告继续使用原子整值替换。

### Requirement: Verification Execution 必须保持 transient
**Reason**: 通用Verification execution产品能力删除。
**Migration**: Agent直接调用项目测试工具。

### Requirement: 执行可靠性实现只服务真实声明能力
**Reason**: 执行可靠性归项目runner，不再属于Task Verification。
**Migration**: 保留项目自有runner实现。

### Requirement: Verification 不得拥有 Task 推进或其他专业 authority
**Reason**: 由更严格的新报告独立性Requirement取代。
**Migration**: 删除Development消费例外。

### Requirement: terminal delivery association 必须证明交付目标使用了对应 Verification Result
**Reason**: Terminal Delivery不再关联Task Verification gate。
**Migration**: 独立展示保存报告和交付事实。

### Requirement: Verification current row 必须保存稳定查询字段
**Reason**: 旧Result查询字段由报告查询字段取代。
**Migration**: 保存内容版本、outcome和updated time。

### Requirement: Verification coverage gap必须触发Declaration Intake提示
**Reason**: gap只属于报告事实，不自动触发流程。
**Migration**: Agent按需使用Project Verification维护地图。

### Requirement: 正式 Verification execution 必须先取得持久化容量
**Reason**: Task Verification不再执行测试或分配容量。
**Migration**: 项目runner自行管理执行资源。

### Requirement: Task Verification 必须为仅工作区Task记录类型化coverage gap
**Reason**: workspace-only特殊分支删除。
**Migration**: 所有Task使用同一checks/gaps报告结构。

### Requirement: Task Verification Application 必须是 Buildr Web 与专业 consumer 的唯一 writer 和 reader
**Reason**: 旧Result consumer契约由独立报告reader/writer取代。
**Migration**: Web只读报告，其他专业Application不消费。

### Requirement: Buildr Web 展示的 Applicability 必须由 target 与 declaration identities 派生
**Reason**: target改为内容版本，declaration改为v4测试地图identity。
**Migration**: 使用新报告inspect applicability。

### Requirement: 正式 Verification 必须稳定识别 invocation 并阻止非显式重复启动
**Reason**: Task Verification不再拥有invocation。
**Migration**: Agent和项目runner处理运行去重。

### Requirement: Formal Verification执行前必须完成capability准备预检
**Reason**: 自动准备预检删除。
**Migration**: Agent按项目说明和环境边界准备。

### Requirement: Verification准备闭包必须保持瞬态交接而非Result authority
**Reason**: Verification准备闭包删除。
**Migration**: 无。

### Requirement: Formal Verification准备门禁必须允许安全降级
**Reason**: Formal Verification准备门禁删除。
**Migration**: 测试无法执行时记录gap或报告问题。

### Requirement: Verification reconciliation 必须只消费可独立核验的 execution authority
**Reason**: reconciliation删除。
**Migration**: Agent直接提交实际检查摘要。

### Requirement: Formal Verification execution 必须绑定 current Candidate
**Reason**: Task Verification不再绑定Candidate。
**Migration**: 报告绑定Task内容版本。

### Requirement: Task Verification 必须形成 closed Verification Request
**Reason**: Request产品对象删除。
**Migration**: Agent在工作上下文中自行安排测试。

### Requirement: Task Verification 必须在执行前形成可解释 Plan
**Reason**: Plan产品对象删除。
**Migration**: Skill指导Agent选择，不持久化Plan。

### Requirement: Execution Record 与 Result 必须对账 matching Plan
**Reason**: Plan、Execution Record和Result三者均退出。
**Migration**: 使用独立最终报告。

### Requirement: Development feedback MUST reuse Formal Verification planning without becoming Result evidence
**Reason**: Development不再依赖Formal Verification planning。
**Migration**: 开发反馈由Agent直接执行且不记录。

### Requirement: 正式 command execution 必须有界收敛 owned process
**Reason**: 通用command runner删除。
**Migration**: 项目runner承担进程边界。

### Requirement: Task Verification 必须提供Formal Plan到policy的只读投影
**Reason**: Development policy和Formal Plan均删除。
**Migration**: 无。

### Requirement: Formal Plan文件输入必须保持有界且不持久化
**Reason**: Formal Plan文件入口删除。
**Migration**: 无。
