## ADDED Requirements

### Requirement: Review Result 必须使用最小 closed v2 schema
每个current Result MUST使用closed `buildr.task-review-result/v2`，只包含`schemaVersion`、`taskId`、`reviewType`、`subjectIdentity`、`method`、`reviewed`、`uncovered`、`findings`、`conclusion`和`completedAt`。`conclusion.outcome` MUST为`accepted|changes-requested`，只表达本次审查意见。

#### Scenario: Agent提交v2完整审查结果
- **WHEN** Agent提交一个真实subject的完整Result
- **THEN** Application MUST规范化并保存所有审查事实
- **AND** MUST拒绝target/applicability/revision/Candidate/Handoff/gate/log/path等额外字段

## MODIFIED Requirements

### Requirement: Task Review 必须使用一个能力维护两个可选 current Result 槽位
Buildr MUST以同一Task Review能力维护`planning|completion`两个可选current槽位。两个槽位 MUST只共享Task ID和Result模型，MUST NOT形成顺序、推进许可或相互前置；没有Task Development、Candidate、Environment或另一个槽位时，active Task仍 MUST可独立record任一真实审查结果。

#### Scenario: 没有Development的普通Task接受完成审查
- **WHEN** Agent对一个active但没有Development Receipt或Candidate的Task完成Completion Review
- **THEN** Application MUST以Agent提交的真实subject identity保存completion Result
- **AND** MUST NOT创建Development、Candidate、gate或另一个Review槽位

#### Scenario: 两种 Review 都已完成
- **WHEN** 同一Task已经保存Planning和Completion Result
- **THEN** inspect MUST分别返回两个current slot且互不覆盖

#### Scenario: 新 Task 尚未执行 Review
- **WHEN** active Task两个slot均不存在
- **THEN** inspect MUST返回两个明确missing slot且不创建占位row

#### Scenario: 旧Review YAML存在
- **WHEN** Workspace保留旧Review YAML文件
- **THEN** v2 Application MUST忽略它且只读取SQLite current

#### Scenario: 未知 Task 请求记录 Result
- **WHEN** caller对不存在的Task执行record
- **THEN** MUST返回Task not found且不得创建orphan Review row

### Requirement: 完整 Review 写入必须原子替换且中断不覆盖 current
`record` MUST要求`expectedCurrentDigest`。空slot MUST使用`absent`，已有slot MUST使用inspect返回的当前digest；Repository MUST在同一事务内比较、写入、回读，任何不匹配或失败 MUST零写入。

#### Scenario: 两个Agent基于同一current并发记录
- **WHEN** 第一个Agent已替换current后第二个Agent提交旧`expectedCurrentDigest`
- **THEN** 第二次写入 MUST返回稳定conflict与最新digest
- **AND** current MUST保持第一个Agent的完整Result

#### Scenario: Review 执行中断
- **WHEN** Agent在形成完整结论或调用record前中断
- **THEN** current MUST保持不变且不得创建空Result

#### Scenario: 新 Review 正常完成
- **WHEN** caller携带匹配expectedCurrentDigest提交完整v2 Result
- **THEN** Repository MUST原子替换对应slot并返回新digest

#### Scenario: 注入 SQLite mutation 失败
- **WHEN** INSERT或UPDATE在事务中失败
- **THEN** MUST rollback并保留last-valid current

#### Scenario: 注入原子替换失败
- **WHEN** 写后回读、query field一致性或COMMIT失败
- **THEN** MUST rollback且另一个Review slot不受影响

### Requirement: Result digest 必须是响应级值 identity 而不是持久 revision
Application MUST对每份有效Result返回response-only `resultDigest`，不得写入payload或revision列。`record` MUST用该digest或`absent`执行事务内compare-and-set，但不得建设history、lease或多版本状态机。

#### Scenario: inspect 有效 Result
- **WHEN** Application成功读取任一current Result
- **THEN** read model MUST返回canonical serialization的稳定resultDigest
- **AND** persisted payload MUST不包含resultDigest或revision

#### Scenario: Result 被完整替换
- **WHEN** 同类型新Result与旧canonical value不同且expected digest匹配
- **THEN** 新read model MUST返回不同resultDigest
- **AND** Application MUST不生成或递增持久revision

### Requirement: Review current row 必须保存稳定查询字段
Repository MUST在同一row保存完整`result_json`、同一Result的`subject_identity`、`outcome`与`updated_at`，只用于定位、Overview摘要与一致性校验，不保存applicability、gate或第二份正文。

#### Scenario: 记录 Review Result
- **WHEN** Application形成新的完整Planning或Completion Result
- **THEN** repository MUST在单一transaction中原子比较、替换并写后验证
- **AND** subject/outcome/time与Result JSON不一致时 MUST rollback

#### Scenario: 读取 Overview
- **WHEN** Task Overview查询Review摘要
- **THEN** repository MUST通过两个LEFT JOIN返回presence、subject、outcome与updated time
- **AND** MUST不反序列化或复制完整findings到Overview

### Requirement: Task Review Application 必须是 Buildr Web 与专业 consumer 的唯一 Result writer
Buildr MUST由共享Application实现`inspect|record`，CLI与HTTP读接口复用该Application。Buildr Web只读展示并在前端形成Agent指令；后端不提供Review prompt或直接writer。

#### Scenario: Agent 完成语义 Review
- **WHEN** Skill形成完整语义结果
- **THEN** Skill MUST只把允许字段与expected digest交给Application record
- **AND** Application MUST独占schema、系统时间、slot、serialization、CAS与effects

#### Scenario: Buildr Web 查看 Result
- **WHEN** Buildr Web请求Task Review详情
- **THEN** HTTP MUST调用Application inspect
- **AND** MUST不直接读取SQLite、生成prompt或判断applicability

#### Scenario: terminal Task 被读取或写入
- **WHEN** 调用方inspect terminal Task或尝试record
- **THEN** Application MUST允许读取已有Result
- **AND** terminal record MUST fail closed

### Requirement: Task Review read model 必须独立于 Development 与 Finish
Task Review Application和GET MUST只读取Task Review current rows及Task identity，不读取Development、Candidate、Handoff、Finish或Terminal Delivery。

#### Scenario: 没有Development的Task
- **WHEN** Task存在Review Result但没有Development Receipt
- **THEN** inspect MUST正常返回两个slot
- **AND** MUST不产生Development missing diagnostic

#### Scenario: completed Task存在旧Finish association
- **WHEN** 旧Finish payload包含历史Review gate
- **THEN** Review页面 MUST不显示adopted或gate disposition
- **AND** 旧值只在Finish历史中保留

## REMOVED Requirements

### Requirement: Review Result 必须使用最小 closed v1 schema
**Reason**: v1 target/outcome已经一次迁入通用subject与局部意见模型。
**Migration**: 使用新增的closed v2 requirement；不双读v1。

#### Scenario: Application 记录完整 Result
- **WHEN** v2 record输入完整且CAS匹配
- **THEN** Application按v2生成系统字段并原子保存

#### Scenario: Result 包含超前字段
- **WHEN** Result包含未登记字段
- **THEN** Application拒绝且零写入

#### Scenario: Review 没有形成完整结论
- **WHEN** reviewed、subject或conclusion不完整
- **THEN** Application拒绝且保留current

### Requirement: Result 适用性必须由 target identity 派生
**Reason**: Review Application不再替Agent观察真实subject或维护current/stale判断。
**Migration**: Agent读取slot的subject identity并通过真实owner工具重新观察。

#### Scenario: 调用方提供target比较
- **WHEN** 旧调用方在inspect提交planning或completion target identity
- **THEN** Interface MUST拒绝旧参数且Result不变

### Requirement: Parent Planning Review 必须只绑定 Parent Plan identity
**Reason**: Parent Plan只作历史证据，Parent管理不再消费Review gate。
**Migration**: 需要审查父任务时，Agent按当前Task目标和真实子任务结果选择subject。

#### Scenario: Agent审查父任务
- **WHEN** Agent需要审查父任务的协调目标
- **THEN** MUST读取当前Task与真实子任务结果选择通用subject identity

### Requirement: Parent v2 Planning Review 必须覆盖完整结构化 Plan identity
**Reason**: 已退役Parent Plan不能成为新Review专用依赖。
**Migration**: 历史Result迁入通用v2 subject identity。

#### Scenario: 旧Parent Plan Review迁移
- **WHEN** v1 current Result引用历史Parent Plan identity
- **THEN** migration MUST保留该identity为v2 subjectIdentity而不恢复Parent gate

### Requirement: Planning Review 必须语义审查 Change checklist 生命周期边界
**Reason**: Agent按实际对象动态选择范围，不把OpenSpec checklist固定为所有Planning Review的必选检查。
**Migration**: OpenSpec自身strict/preflight检查Change语义；Review只记录实际reviewed/uncovered。

#### Scenario: planning包含OpenSpec checklist
- **WHEN** Agent选择审查该checklist
- **THEN** 按真实语义记录，不创建Application门禁

### Requirement: Planning Review必须审查真实跨owner结果边界
**Reason**: 跨owner范围由Agent按当前目标判断，不内置特定owner清单或强制结论。
**Migration**: 相关边界可进入普通reviewed/uncovered/findings。

#### Scenario: 实际跨owner对象
- **WHEN** Agent识别出跨owner风险
- **THEN** 按真实范围审查且不建立统一许可层
