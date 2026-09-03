# task-verification Specification

## Purpose
定义 Buildr 如何通过可替换的任务验证能力解析项目政策、执行分层验证，并生成绑定候选身份、包含真实耗时且具备明确生命周期的结果证据。
## Requirements

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

### Requirement: Task Verification Application不得生成Agent提示词
Task Verification Application MUST只维护Project测试地图绑定、正式报告和确定性适用性；Agent验证指令由界面或调用方基于Skill与当前Task形成。Application MUST不生成、保存或返回prompt。

#### Scenario: Agent开始任务验证
- **WHEN** 用户从Buildr Web或对话要求验证正式Task
- **THEN** Agent MUST读取Task Verification Skill、当前Task、真实改动和测试地图
- **AND** Application MUST不参与审阅范围选择或prompt生成

### Requirement: Task Verification current 必须使用调用方摘要原子替换
Task Verification `record` MUST接收调用方最近一次 `inspect` 观察到的摘要：空槽位使用 `absent`，已有报告使用 `reportDigest`。该摘要 MUST仅作为调用参数，不进入 Verification Report 业务事实。Repository MUST在同一 `BEGIN IMMEDIATE` 事务中读取和验证 current、计算摘要、比较 expected、匹配后替换、写后回读并提交；任何失败 MUST保持原 current。

#### Scenario: 首次记录空槽位
- **WHEN** 调用方 inspect 得到空槽位并以 `absent` 记录合法报告
- **THEN** Repository MUST原子创建 current 并返回新 `reportDigest`
- **AND** 持久化报告 MUST不包含 expected 摘要字段

#### Scenario: 两个调用方并发替换
- **WHEN** 两个调用方基于同一 current `reportDigest` 依次提交不同报告
- **THEN** 第一个匹配写入 MUST成功，第二个 MUST返回 `task_verification_current_conflict` 和最新摘要
- **AND** 第二个调用方 MUST不覆盖第一个 current，也不得由 Application 自动重试

#### Scenario: 写入链失败
- **WHEN** serialization、SQL mutation、写后回读或 commit 任一失败
- **THEN** Repository MUST回滚事务并保留原 current
- **AND** diagnostic MUST指出失败阶段且不得误报写入成功

#### Scenario: 调用方处理冲突
- **WHEN** Agent 收到 Verification current conflict
- **THEN** Agent MUST重新 inspect 真实报告和当前内容后决定重做或替换
- **AND** MUST不创建 revision、history、lease、Plan、Run 或 Execution Record
