## REMOVED Requirements

### Requirement: Buildr Web 必须以 Application terminal projection 展示 Task 交付事实
**Reason**: 旧要求让Task页面通过Terminal Delivery聚合Development、Review和Finish，形成第二完成判断。
**Migration**: Overview读取Task Record和独立专业摘要；历史交付section只读Task Record与Finish history。

#### Scenario: 旧terminal聚合不再可用
- **WHEN** Buildr Web读取Task详情
- **THEN** MUST分别调用Task Record与专业read model
- **AND** MUST不请求包含Development/Review association的统一terminal projection

## ADDED Requirements

### Requirement: Buildr Web Task 页面必须分别读取独立专业事实
Buildr Web MUST以Task Record为任务目标和状态authority，并按需分别读取Review、Verification、Development、Environment和Finish history read model。页面 MUST NOT通过Candidate、Handoff、gate match或terminal association构造统一完成、交付或下一步状态。

#### Scenario: 没有Development的active Task
- **WHEN** Task具有Review或Verification Result但没有Development Receipt
- **THEN** 概览和证据页 MUST正常展示Task与专业Result
- **AND** 研发页 MAY显示尚无研发记录但不得影响其他页签

#### Scenario: completed Task历史不完整
- **WHEN** Task Record已completed但旧Development或Finish历史不可读
- **THEN** 页面 MUST保持完成结果并只在对应历史section显示diagnostic
- **AND** MUST NOT将任务降级为未完成

#### Scenario: 发起专业Agent动作
- **WHEN** 用户从Review或Verification区块选择交给Agent
- **THEN** 前端 MUST只传递Task ID、动作类型和必要上下文
- **AND** 专业Application MUST不生成或保存工作prompt
